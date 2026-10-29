import test from 'node:test';
import assert from 'node:assert/strict';
import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';
import { User } from '../models/userModel.js';
import { sequelize } from '../models/db.js';
import * as controller from '../controllers/announcementController.js';
import { announcementAccess } from '../middleware/announcementAccess.js';
const row = data => ({ ...data, get() { const result = { ...this }; delete result.get; delete result.update; return result; }, async update(values) { Object.assign(this, values); return this; } });
const owner = { id: 1, role: 'admin' }, recipient = { id: 2, role: 'staff' }, outsider = { id: 3, role: 'staff' };
function response() { return { code: 200, locals: {}, status(code) { this.code = code; return this; }, send(body) { this.body = body; }, render(view, data) { this.view = view; this.data = data; }, redirect(url) { this.url = url; } }; }
const request = (user = recipient, extra = {}) => ({ currentUser: user, params: {}, query: {}, body: {}, flash() {}, ...extra });
test('controller access and lifecycle with isolated model doubles (no database writes)', async t => {
  process.env.ANNOUNCEMENT_POST_ROLES = 'admin'; process.env.ANNOUNCEMENT_MEMBER_ROLES = 'admin,staff';
  let announcements, notifications;
  const originals = [];
  function stub(object, name, fn) { originals.push([object, name, object[name]]); object[name] = fn; }
  stub(Announcement, 'findAll', async () => announcements);
  stub(Announcement, 'findByPk', async id => announcements.find(a => a.id === Number(id)));
  stub(Notification, 'findAll', async options => notifications.filter(n => n.userId === options.where.userId));
  stub(Notification, 'findOne', async options => notifications.find(n => n.id === Number(options.where.id) && n.userId === options.where.userId));
  stub(Notification, 'findOrCreate', async options => { let n = notifications.find(n => n.userId === options.where.userId && n.announcementId === options.where.announcementId); if (!n) { n = row({ id: notifications.length + 1, ...options.where, readAt: null }); notifications.push(n); } return [n]; });
  stub(User, 'findAll', async () => [owner, recipient, outsider].map(row));
  stub(sequelize, 'transaction', async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  const reset = () => { announcements = [row({ id: 10, title: 'Restricted', content: 'Details', creatorId: 1, status: 'published', audience: 'specific', recipientIds: [2], recipientRoles: [], publishedAt: new Date(), archivedAt: null, deletedAt: null })]; notifications = [row({ id: 20, announcementId: 10, userId: 2, readAt: null }), row({ id: 21, announcementId: 10, userId: 3, readAt: null })]; };
  try {
    await t.test('search and direct URL do not leak another audience', async () => { reset(); const res = response(); await controller.listAnnouncements(request(outsider, { query: { q: 'Restricted' } }), res); assert.equal(res.data.announcements.length, 0); const detail = response(); await controller.detailAnnouncement(request(outsider, { params: { id: '10' } }), detail); assert.equal(detail.code, 404); });
    await t.test('draft excluded from recipient lists and notifications', async () => { reset(); announcements[0].status = 'draft'; for (const method of ['listAnnouncements','notificationsPage']) { const res = response(); await controller[method](request(), res); assert.equal((res.data.announcements || res.data.notifications).length, 0); } });
    await t.test('notification ownership and current audience rechecked', async () => { reset(); for (const [user,id] of [[outsider,'20'],[outsider,'21']]) { const res = response(); await controller.openNotification(request(user, { params: { id } }), res); assert.equal(res.code, 404); } assert.ok(notifications.every(n => !n.readAt)); });
    await t.test('opening notification marks only its recipient row read', async () => { reset(); const res = response(); await controller.openNotification(request(recipient, { params: { id: '20' } }), res); assert.equal(res.url, '/announcements/10'); assert.ok(notifications[0].readAt); assert.equal(notifications[1].readAt, null); });
    await t.test('admin cannot edit or delete another original poster', async () => { reset(); announcements[0].creatorId = 99; for (const method of ['editAnnouncementPage','deleteAnnouncement','archiveAnnouncement','restoreAnnouncement']) { const res = response(); await controller[method](request(owner, { params: { id: '10' } }), res); assert.equal(res.code, 404); } assert.equal(announcements[0].deletedAt, null); });
    await t.test('archive and restore preserve publication and notification history', async () => { reset(); const date = announcements[0].publishedAt; for (const method of ['archiveAnnouncement','restoreAnnouncement']) { const res = response(); await controller[method](request(owner, { params: { id: '10' } }), res); assert.equal(res.url, '/announcements'); assert.equal(notifications.length, 2); assert.equal(announcements[0].publishedAt, date); } assert.equal(announcements[0].archivedAt, null); });
    await t.test('edits deduplicate notifications and preserve creator and date', async () => { reset(); const a = announcements[0], published = a.publishedAt; const req = request(owner, { params: { id: '10' }, body: { title: 'Updated', content: 'Update', status: 'published', audience: 'specific', recipientIds: ['2'], recipientRoles: ['staff'], creatorId: '3' } }); for (let i=0;i<2;i++) { const res = response(); await controller.updateAnnouncement(req,res); assert.equal(res.url, '/announcements'); } assert.equal(notifications.length,2); assert.equal(a.creatorId,1); assert.equal(a.publishedAt,published); });
    await t.test('soft delete retains notifications and blocks direct viewing', async () => { reset(); await controller.deleteAnnouncement(request(owner,{ params:{ id:'10' } }),response()); assert.ok(announcements[0].deletedAt); assert.equal(notifications.length,2); const res=response(); await controller.detailAnnouncement(request(recipient,{params:{id:'10'}}),res); assert.equal(res.code,404); });
    await t.test('view-only user cannot create', async () => { const res=response(); await controller.createAnnouncement(request(),res); assert.equal(res.code,403); });
    await t.test('CSRF blocks missing and non-ASCII manipulated token', async () => { stub(User,'findByPk',async()=>recipient); for(const token of [undefined,'�'.repeat(64)]) { const res=response(); let next=false; await announcementAccess({session:{userId:2,announcementCsrf:'a'.repeat(64)},method:'POST',body:{_csrf:token}},res,()=>{next=true;}); assert.equal(res.code,403); assert.equal(next,false); } });

    await t.test('pagination preserves encoded search and returns the correct visible page',async()=>{
      reset();const base=announcements[0];announcements=Array.from({length:11},(_,i)=>row({...base,id:i+1,title:'Visible & update '+i,content:'Search details'}));
      const res=response();await controller.listAnnouncements(request(recipient,{query:{q:'visible & update',status:'published',page:'2'}}),res);
      assert.equal(res.code,200);assert.equal(res.data.announcements.length,3);assert.equal(res.data.pagination.page,2);assert.equal(res.data.pagination.total,11);assert.ok(res.data.previousPage.includes('q=visible+%26+update'));assert.ok(!res.data.pagination.hasNext);
    });
    await t.test('all-status totals include only authorized archives and validate unknown filters',async()=>{
      reset();announcements[0].archivedAt=new Date();let res=response();await controller.listAnnouncements(request(owner,{query:{status:'all'}}),res);assert.equal(res.data.announcements.length,1);
      res=response();await controller.listAnnouncements(request(recipient,{query:{status:'all'}}),res);assert.equal(res.data.announcements.length,0);
      res=response();await controller.listAnnouncements(request(owner,{query:{status:'invented'}}),res);assert.equal(res.code,400);
    });
    await t.test('validation rerenders the editor without losing the entered message or recipients',async()=>{
      reset();const res=response();res.req={accepts:()=>true};await controller.createAnnouncement(request(owner,{body:{title:' ',content:'Preserve this message',status:'draft',audience:'specific',recipientIds:['2']}}),res);
      assert.equal(res.code,400);assert.equal(res.view,'announcement-edit');assert.equal(res.data.announcement.content,'Preserve this message');assert.ok(res.data.users.find(u=>u.id===2).selected);assert.ok(res.data.formError);
    });
  } finally { for (const [object,name,original] of originals.reverse()) object[name]=original; }
});
