import test from 'node:test';
import assert from 'node:assert/strict';
import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';
import { User } from '../models/userModel.js';
import { sequelize } from '../models/db.js';
import { createAnnouncement } from '../controllers/announcementController.js';
import { logAnnouncementError } from '../services/announcementErrors.js';
const res = () => ({ code:200, status(c){this.code=c;return this;},send(body){this.body=body;},redirect(url){this.url=url;} });
test('publication orchestration with isolated model doubles', async t => {
  const original = { create:Announcement.create, users:User.findAll, notify:Notification.findOrCreate, transaction:sequelize.transaction, log:console.error };
  const previous = { post:process.env.ANNOUNCEMENT_POST_ROLES, member:process.env.ANNOUNCEMENT_MEMBER_ROLES };
  process.env.ANNOUNCEMENT_POST_ROLES='admin'; process.env.ANNOUNCEMENT_MEMBER_ROLES='staff';
  let writes, deliveries, transactionResult, failNotification, logs;
  const tx = { LOCK:{UPDATE:'UPDATE'} };
  const reset = () => { writes=[];deliveries=[];transactionResult=null;failNotification=false;logs=[]; };
  Announcement.create=async (values,options) => { assert.equal(options.transaction,tx); const a={id:9,...values};writes.push(a);return a; };
  User.findAll=async options => { assert.equal(options.transaction,tx);return [{id:1,role:'admin'},{id:2,role:'staff'},{id:3,role:'staff'},{id:4,role:'visitors'},{id:5,role:'admin'}]; };
  Notification.findOrCreate=async options => {assert.equal(options.transaction,tx);if(failNotification) throw Object.assign(new Error('SECRET SQL CONNECTION DATA'),{name:'SequelizeDatabaseError'});deliveries.push(options.where);return [{},true];};
  sequelize.transaction=async fn => {try {const result=await fn(tx);transactionResult='commit requested';return result;}catch(e){transactionResult='rollback requested';throw e;}};
  console.error=message=>logs.push(message);
  const req = body => ({currentUser:{id:1,role:'admin'},body:{title:'Test',content:'Content',status:'published',audience:'specific',recipientIds:['2'],...body},flash(){}});
  try {
    await t.test('draft creation preserves author and creates no notifications',async()=>{reset();const r=res();await createAnnouncement(req({status:'draft',creatorId:999}),r);assert.equal(r.url,'/announcements');assert.equal(writes[0].creatorId,1);assert.equal(writes[0].publishedAt,null);assert.equal(deliveries.length,0);assert.equal(transactionResult,'commit requested');});
    await t.test('publication notifies only selected recipients',async()=>{reset();const r=res();await createAnnouncement(req({}),r);assert.ok(writes[0].publishedAt);assert.deepEqual(deliveries,[{announcementId:9,userId:2}]);assert.equal(transactionResult,'commit requested');});
    await t.test('All Members notifies all registered roles except the author',async()=>{reset();await createAnnouncement(req({audience:'all',recipientIds:undefined}),res());assert.deepEqual(deliveries.map(n=>n.userId),[2,3,4,5]);});
    await t.test('specific user and role union sends once per user',async()=>{reset();await createAnnouncement(req({recipientRoles:['staff']}),res());assert.deepEqual(deliveries.map(n=>n.userId),[2,3]);});
    await t.test('unknown recipient aborts before announcement creation',async()=>{reset();const r=res();await createAnnouncement(req({recipientIds:['999']}),r);assert.equal(r.code,400);assert.equal(writes.length,0);assert.equal(transactionResult,'rollback requested');});
    await t.test('notification failure propagates to managed transaction with safe error',async()=>{reset();failNotification=true;const r=res();await createAnnouncement(req({}),r);assert.equal(r.code,503);assert.equal(transactionResult,'rollback requested');assert.equal(r.url,undefined);assert.ok(!r.body.includes('SECRET'));assert.deepEqual(logs,['[announcements:request] SequelizeDatabaseError']);});
    await t.test('author-only audience produces no self-notification',async()=>{reset();const r=res();await createAnnouncement(req({recipientIds:['1']}),r);assert.equal(r.url,'/announcements');assert.equal(deliveries.length,0);});
    await t.test('diagnostics never print arbitrary names or messages',()=>{reset();logAnnouncementError('test',{name:'SECRET',message:'SECRET'});assert.deepEqual(logs,['[announcements:test] UnexpectedError']);});
  } finally { Announcement.create=original.create;User.findAll=original.users;Notification.findOrCreate=original.notify;sequelize.transaction=original.transaction;console.error=original.log; for(const [key,value] of [['ANNOUNCEMENT_POST_ROLES',previous.post],['ANNOUNCEMENT_MEMBER_ROLES',previous.member]]){if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});

