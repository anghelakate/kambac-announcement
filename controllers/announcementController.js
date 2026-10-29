import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';
import { User } from '../models/userModel.js';
import { sequelize } from '../models/db.js';
import { canPost, canManage, canView, isRecipient, parseInput, memberRoles } from '../services/announcementPolicy.js';
import { logAnnouncementError } from '../services/announcementErrors.js';
import { workspaceData, paginate, toPlain } from '../services/workspaceData.js';
const plain = row => row.get({ plain: true });
const validId = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const fail = (res, error) => {
  if (![400, 403, 404].includes(error.status)) logAnnouncementError('request', error);
  const code=[400,403,404].includes(error.status)?error.status:503;
  const message=code===503?'Your workspace is temporarily unavailable. Please try again shortly.':error.message;
  if(res.req?.accepts('html'))return res.status(code).render('workspace-error',{title:'Request unavailable',errorTitle:code===404?'This update is not available':code===403?'This action is not permitted':'We could not complete that request',errorMessage:message});
  return res.status(code).send(message);
};
const missing = () => Object.assign(new Error('Announcement not found.'), { status: 404 });
async function choices(transaction) {
  return (await User.findAll({ attributes: ['id', 'name', 'role'], transaction })).filter(u => memberRoles().includes(u.role));
}
async function inputFor(body, transaction) {
  let input;
  try { input = parseInput(body); } catch (e) { e.status = 400; throw e; }
  const users = await choices(transaction);
  if (input.recipientIds.some(id => !users.some(u => u.id === id)) || input.recipientRoles.some(r => !memberRoles().includes(r) || !users.some(u => u.role === r))) throw Object.assign(new Error('Select existing eligible recipients.'), { status: 400 });
  return { input, users };
}
async function notify(a, users, transaction) {
  for (const user of users.filter(u => u.id !== a.creatorId && isRecipient(u, a))) {
    await Notification.findOrCreate({ where: { announcementId: a.id, userId: user.id }, defaults: { readAt: null }, transaction });
  }
}
async function owned(req, transaction) {
  if (!validId(req.params.id)) throw missing();
  const a = await Announcement.findByPk(req.params.id, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!a || a.deletedAt || !canManage(req.currentUser, a)) throw missing();
  return a;
}
export async function listAnnouncements(req, res) {
  try {
    const data=await workspaceData(req.currentUser);
    const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,255):'';
    const status=typeof req.query.status==='string'?req.query.status:'';
    if (!['','all','draft','published','archived'].includes(status)) throw Object.assign(new Error('Choose a valid announcement status.'),{status:400});
    const rows=data.announcements.filter(a=>status==='all'||(status==='archived'?!!a.archivedAt:!a.archivedAt&&(!status||a.status===status))).filter(a=>!q||(a.title+' '+a.content).toLowerCase().includes(q.toLowerCase()));
    const pagination=paginate(rows,req.query.page);
    const link=page=>'/announcements?'+new URLSearchParams({q,status,page:String(page)});
    res.render('announcements',{...data,title:'Announcements',activeAnnouncements:true,announcements:pagination.items,pagination,q,filterStatus:status,hasFilters:!!(q||status),showPagination:pagination.pages>1,previousPage:link(pagination.page-1),nextPage:link(pagination.page+1)});
  } catch(e){fail(res,e);}
}
export async function workspaceDashboard(req,res){
  try{const data=await workspaceData(req.currentUser);res.render('dashboard',{...data,title:'Overview',activeDashboard:true,recentAnnouncements:data.announcements.filter(a=>!a.archivedAt&&a.status==='published').slice(0,3),recentNotifications:data.notifications.slice(0,4)});}catch(e){fail(res,e);}
}
export async function accountPage(req,res){
  try{const data=await workspaceData(req.currentUser);res.render('account',{...data,title:'My account',activeAccount:true});}catch(e){fail(res,e);}
}
async function editorPage(req,res,announcement={},formError=null,status=200){
  const data=await workspaceData(req.currentUser);
  const users=data.eligibleUsers.map(u=>({...toPlain(u),selected:(announcement.recipientIds||[]).includes(u.id)}));
  const roleChoices=memberRoles().map(role=>({role,selected:(announcement.recipientRoles||[]).includes(role)}));
  res.status(status).render('announcement-edit',{...data,title:announcement.id?'Edit announcement':'Create announcement',activeAnnouncements:true,announcement,editing:!!announcement.id,users,roleChoices,formError});
}
export async function newAnnouncementPage(req,res){
  if(!canPost(req.currentUser))return fail(res,Object.assign(new Error('Management is not permitted for your role.'),{status:403}));
  try{await editorPage(req,res,{status:'draft',audience:'all'});}catch(e){fail(res,e);}
}
function formValues(body,id){return {id,title:typeof body.title==='string'?body.title.slice(0,255):'',content:typeof body.content==='string'?body.content.slice(0,60000):'',status:body.status==='published'?'published':'draft',audience:body.audience==='specific'?'specific':'all',recipientIds:[body.recipientIds||[]].flat().map(Number).filter(Number.isSafeInteger),recipientRoles:[body.recipientRoles||[]].flat().filter(r=>memberRoles().includes(r))};}
async function formFailure(req,res,error,id){
  if(error.status===400&&res.req){try{return await editorPage(req,res,formValues(req.body,id),error.message,400);}catch(e){return fail(res,e);}}
  return fail(res,error);
}

export async function createAnnouncement(req, res) {
  if (!canPost(req.currentUser)) return fail(res,Object.assign(new Error('Posting is not permitted for your role.'),{status:403}));
  try {
    await sequelize.transaction(async transaction => {
      const { input, users } = await inputFor(req.body, transaction);
      const a = await Announcement.create({ ...input, creatorId: req.currentUser.id, publishedAt: input.status === 'published' ? new Date() : null }, { transaction });
      if (a.status === 'published') await notify(a, users, transaction);
    });
    req.flash('success_msg', 'Announcement saved.'); res.redirect('/announcements');
  } catch (e) { await formFailure(req,res,e); }
}
export async function editAnnouncementPage(req,res){
  if(!canPost(req.currentUser))return fail(res,Object.assign(new Error('Management is not permitted for your role.'),{status:403}));
  try{await editorPage(req,res,plain(await owned(req)));}catch(e){fail(res,e);}
}

export async function updateAnnouncement(req, res) {
  if (!canPost(req.currentUser)) return fail(res,Object.assign(new Error('Management is not permitted for your role.'),{status:403}));
  try {
    await sequelize.transaction(async transaction => {
      const a = await owned(req, transaction);
      const { input, users } = await inputFor(req.body, transaction);
      await a.update({ ...input, publishedAt: a.publishedAt || (input.status === 'published' ? new Date() : null) }, { transaction });
      if (a.status === 'published' && !a.archivedAt) await notify(a, users, transaction);
    });
    req.flash('success_msg', 'Announcement updated.'); res.redirect('/announcements');
  } catch (e) { await formFailure(req,res,e,Number(req.params.id)); }
}
export async function deleteAnnouncement(req, res) { return lifecycle(req, res, 'delete'); }
export async function archiveAnnouncement(req, res) { return lifecycle(req, res, 'archive'); }
export async function restoreAnnouncement(req, res) { return lifecycle(req, res, 'restore'); }
async function lifecycle(req, res, action) {
  if (!canPost(req.currentUser)) return fail(res,Object.assign(new Error('Management is not permitted for your role.'),{status:403}));
  try {
    await sequelize.transaction(async transaction => {
      const a = await owned(req, transaction);
      await a.update(action === 'delete' ? { deletedAt: new Date() } : { archivedAt: action === 'archive' ? new Date() : null }, { transaction });
    });
    req.flash('success_msg', action === 'delete' ? 'Announcement removed; history retained.' : 'Announcement updated.'); res.redirect('/announcements');
  } catch (e) { fail(res, e); }
}
export async function detailAnnouncement(req,res){
  try{
    if(!validId(req.params.id))throw missing();
    const a=await Announcement.findByPk(req.params.id);
    if(!a||!canView(req.currentUser,a))throw missing();
    const data=await workspaceData(req.currentUser);
    res.render('announcement-detail',{...data,title:'Announcement details',activeAnnouncements:true,announcement:data.present(a)});
  }catch(e){fail(res,e);}
}

export async function notificationsPage(req,res){
  try{
    const data=await workspaceData(req.currentUser);
    const unreadOnly=req.query.filter==='unread';
    res.render('notifications',{...data,title:'Notifications',activeNotifications:true,notifications:data.notifications.filter(n=>!unreadOnly||n.unread),notificationTotal:data.notifications.length,unread:data.unreadCount,unreadOnly});
  }catch(e){fail(res,e);}
}

export async function openNotification(req, res) {
  try {
    if (!validId(req.params.id)) throw missing();
    let target;
    await sequelize.transaction(async transaction => {
      const lookup = await Notification.findOne({ where: { id: req.params.id, userId: req.currentUser.id }, transaction });
      if (!lookup) throw missing();
      // Match publication's lock order: announcement first, notification second.
      const a = await Announcement.findByPk(lookup.announcementId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!a || a.deletedAt || a.archivedAt || a.status !== 'published' || !isRecipient(req.currentUser, a)) throw missing();
      const n = await Notification.findOne({ where: { id: req.params.id, userId: req.currentUser.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!n || n.announcementId !== a.id) throw missing();
      if (!n.readAt) await n.update({ readAt: new Date() }, { transaction });
      target = a.id;
    });
    res.redirect(`/announcements/${target}`);
  } catch (e) { fail(res, e); }
}

