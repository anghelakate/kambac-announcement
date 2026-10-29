import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, paginate, workspaceData } from '../services/workspaceData.js';
import { User } from '../models/userModel.js';
import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';
test('summary counts active publication, own drafts, archive and unread separately',()=>{assert.deepEqual(summarize([{status:'published'},{status:'draft'},{status:'published',archivedAt:new Date()}],[{readAt:null},{readAt:new Date()}]),{total:3,published:1,drafts:1,archived:1,unread:1});});
test('pagination bounds pages without dropping records',()=>{const rows=Array.from({length:19},(_,id)=>({id}));const middle=paginate(rows,'2');assert.equal(middle.items.length,8);assert.equal(middle.start,9);assert.equal(middle.end,16);assert.equal(middle.pages,3);assert.equal(paginate(rows,'999').page,3);for(const value of ['-1','bad','1 OR 1=1'])assert.equal(paginate(rows,value).page,1);assert.deepEqual(paginate([],1).items,[]);});
test('dashboard counts and notification previews never leak restricted or deleted records',async()=>{
 const originals=[Announcement.findAll,User.findAll,Notification.findAll];
 const plain=a=>({...a,get(){return {...a};}});
 Announcement.findAll=async()=>[
 {id:1,title:'Visible',content:'Public',creatorId:9,audience:'all',status:'published'},
 {id:2,title:'Restricted',content:'Private',creatorId:9,audience:'specific',recipientIds:[3],recipientRoles:[],status:'published'},
 {id:3,title:'Draft',content:'Private draft',creatorId:9,audience:'all',status:'draft'},
 {id:4,title:'Archived',content:'Private archive',creatorId:9,audience:'all',status:'published',archivedAt:new Date()},
 {id:5,title:'Deleted',content:'Deleted',creatorId:9,audience:'all',status:'published',deletedAt:new Date()}
 ].map(plain);
 User.findAll=async()=>[{id:9,name:'Actual Author',role:'admin'}];
 Notification.findAll=async()=>[1,2,3,4,5].map(id=>plain({id,userId:2,announcementId:id,readAt:null}));
 try{const viewer=await workspaceData({id:2,name:'Viewer',role:'visitors'});assert.equal(viewer.summary.total,1);assert.equal(viewer.summary.published,1);assert.equal(viewer.summary.drafts,0);assert.equal(viewer.unreadCount,1);assert.equal(viewer.announcements[0].authorName,'Actual Author');assert.deepEqual(viewer.notifications.map(n=>n.title),['Visible']);const owner=await workspaceData({id:9,name:'Actual Author',role:'admin'});assert.equal(owner.summary.drafts,1);assert.equal(owner.summary.archived,1);assert.equal(owner.announcements.length,4);}finally{[Announcement.findAll,User.findAll,Notification.findAll]=originals;}
});
