import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';
import { User } from '../models/userModel.js';
import { canView, canManage, canPost, isRecipient } from './announcementPolicy.js';
export const toPlain = value => typeof value.get === 'function' ? value.get({plain:true}) : {...value};
export const formatDate = value => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(value)) : 'Date unavailable';
export const initials = name => (name || 'Member').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
export function summarize(rows, notifications) {
  const active = rows.filter(a=>!a.archivedAt);
  return {total:rows.length,published:active.filter(a=>a.status==='published').length,drafts:active.filter(a=>a.status==='draft').length,archived:rows.filter(a=>a.archivedAt).length,unread:notifications.filter(n=>!n.readAt).length};
}
export async function workspaceData(user) {
  const rows = await Announcement.findAll({order:[['createdAt','DESC'],['id','DESC']]});
  const visible = rows.filter(a=>canView(user,a));
  const users = await User.findAll({attributes:['id','name','role']});
  const names = new Map(users.map(u=>[u.id,u.name]));
  const present = a => ({...toPlain(a),authorName:names.get(a.creatorId)||'Legacy announcement',authorInitials:initials(names.get(a.creatorId)||'KAMBAC'),dateLabel:formatDate(a.createdAt),publishedLabel:a.publishedAt?formatDate(a.publishedAt):null,displayStatus:a.archivedAt?'archived':a.status,canManage:canManage(user,a),audienceLabel:a.audience==='all'?'All Members':'Selected audience',excerpt:a.content.length>240?a.content.slice(0,240)+'...':a.content});
  const byId=new Map(rows.map(a=>[a.id,a]));
  const notifications=(await Notification.findAll({where:{userId:user.id},order:[['createdAt','DESC'],['id','DESC']]})).flatMap(n=>{
    const a=byId.get(n.announcementId);
    if(!a||a.deletedAt||a.archivedAt||a.status!=='published'||!isRecipient(user,a))return [];
    return [{...toPlain(n),title:a.title,dateLabel:formatDate(n.createdAt),authorName:names.get(a.creatorId)||'KAMBAC',unread:!n.readAt}];
  });
  const account={id:user.id,name:user.name||'KAMBAC member',email:user.email||'',role:user.role,initials:initials(user.name)};
  return {announcements:visible.map(present),notifications,summary:summarize(visible,notifications),unreadCount:notifications.filter(n=>!n.readAt).length,account,canPost:canPost(user),eligibleUsers:users,present,today:formatDate(new Date())};
}
export function paginate(rows, value, size=8) {
  const pages=Math.max(1,Math.ceil(rows.length/size));
  const page=Math.min(pages,Math.max(1,/^\d+$/.test(String(value||''))?Number(value):1));
  return {items:rows.slice((page-1)*size,page*size),page,pages,total:rows.length,start:rows.length?(page-1)*size+1:0,end:Math.min(page*size,rows.length),hasPrevious:page>1,hasNext:page<pages};
}
