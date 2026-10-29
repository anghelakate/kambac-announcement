import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import hbs from 'hbs';
import { once } from 'node:events';
import app from '../index.js';
import { User } from '../models/userModel.js';
import { Announcement } from '../models/announcementModel.js';
import { AnnouncementNotification as Notification } from '../models/notificationModel.js';

test('HTTP login, sessions, rendered views and access checks with isolated model doubles', async t => {
  const original = { userOne:User.findOne,userPk:User.findByPk,userAll:User.findAll,userCreate:User.create,annAll:Announcement.findAll,annPk:Announcement.findByPk,notAll:Notification.findAll };
  const user={id:2,name:'Test recipient',role:'staff',password:await bcrypt.hash('test-only-password',4)};
  const make = values => ({...values,get(){return {...values};}});
  const records=[make({id:10,title:'<script>alert(1)</script>',content:'Visible details',status:'published',audience:'specific',creatorId:1,recipientIds:[2],recipientRoles:[]}),make({id:11,title:'PRIVATE TITLE',content:'PRIVATE CONTENT',status:'published',audience:'specific',creatorId:1,recipientIds:[3],recipientRoles:[]}),make({id:12,title:'PRIVATE DRAFT',content:'draft',status:'draft',audience:'all',creatorId:1,recipientIds:[],recipientRoles:[]})];
  User.findOne=async()=>user;User.findByPk=async()=>user;User.findAll=async()=>[make({id:2,name:user.name,role:user.role})];Announcement.findAll=async()=>records;Announcement.findByPk=async id=>records.find(a=>a.id===Number(id));Notification.findAll=async()=>[make({id:1,userId:2,announcementId:10,readAt:null}),make({id:2,userId:2,announcementId:11,readAt:null})];
  const server=app.listen(0);await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  let cookie;
  const send=(path,options={})=>fetch(base+path,{redirect:'manual',...options,headers:{...(cookie?{cookie}:{}),...options.headers}});
  try {
    assert.ok(hbs.handlebars.partials['announcement-nav'], 'Partials ready at startup');
    await t.test('startup serves login and redirects anonymous protected requests',async()=>{assert.equal((await send('/login')).status,200);for(const path of ['/announcements','/announcements/10','/notifications','/dashboard','/account']){const r=await send(path);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login');}});
    await t.test('real login creates a session cookie without a database write',async()=>{const r=await send('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.invalid',password:'test-only-password'})});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/announcements');cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('connect.sid='));});
    await t.test('list and search escape visible titles and hide restricted content',async()=>{for(const path of ['/announcements','/announcements?q=PRIVATE']){const r=await send(path);assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes('PRIVATE TITLE'));assert.ok(!html.includes('PRIVATE CONTENT'));assert.ok(!html.includes('PRIVATE DRAFT'));assert.ok(!html.includes('<script>alert(1)</script>'));if(path==='/announcements')assert.ok(html.includes('&lt;script&gt;'));}});
    await t.test('direct details and edit URLs enforce permissions',async()=>{assert.equal((await send('/announcements/10')).status,200);for(const path of ['/announcements/11','/announcements/12','/announcements/invalid'])assert.equal((await send(path)).status,404);});
    await t.test('notification preview hides records with revoked audience',async()=>{const r=await send('/notifications');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('1 unread'));assert.ok(!html.includes('PRIVATE TITLE'));const token=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];const denied=await send('/announcements',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token,title:'Forged',content:'Forged',status:'published',audience:'all'})});assert.equal(denied.status,403);});
    await t.test('mutations without CSRF are blocked and HEAD works',async()=>{assert.equal((await send('/announcements/10/delete',{method:'POST'})).status,403);assert.equal((await send('/announcements',{method:'HEAD'})).status,200);});
    await t.test('Staff and Visitors cannot forge Admin permissions on any write route',async()=>{
      for(const role of ['staff','visitors']) {
        user.role=role;
        const page=await send('/notifications');
        const html=await page.text();
        const token=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
        assert.equal((await send('/announcements/10/edit')).status,403);
        assert.ok(!(await (await send('/announcements')).text()).includes('Create announcement'));
        for(const path of ['/announcements','/announcements/10/edit','/announcements/10/delete','/announcements/10/archive','/announcements/10/restore']) {
          const r=await send(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token,title:'Forged',content:'Forged',status:'published',audience:'all',role:'admin',creatorId:'2'})});
          assert.equal(r.status,403);
        }
      }
      user.role='staff';
    });
    await t.test('all roles receive actual announcements, dashboard and profile views',async()=>{
      for(const role of ['admin','staff','visitors']) {
        user.role=role;
        cookie=undefined;
        const login=await send('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.invalid',password:'test-only-password'})});
        assert.equal(login.headers.get('location'),'/announcements');
        cookie=login.headers.get('set-cookie').split(';')[0];
        const page=await send('/announcements');const html=await page.text();assert.equal(page.status,200);assert.ok(html.includes('class="announcement-app"'));assert.ok(!html.includes('Welcome to your dashboard!'));
        assert.equal(html.includes('Create announcement'),role==='admin');
        const dashboard=await send('/dashboard');assert.equal(dashboard.status,200);assert.ok((await dashboard.text()).includes('Workspace overview'));const profile=await send('/account');assert.equal(profile.status,200);assert.ok((await profile.text()).includes('Account information'));assert.equal((await send('/announcements/new')).status,role==='admin'?200:403);
      }
    });
    await t.test('registration hashes password, ignores submitted role, and lands on announcements',async()=>{
      cookie=undefined;
      User.findOne=async()=>null;
      User.create=async values=>{assert.deepEqual(Object.keys(values).sort(),['email','name','password']);assert.ok(await bcrypt.compare('registration-test-only',values.password));user.role='visitors';return user;};
      const r=await send('/register',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Registration test',email:'new@example.invalid',password:'registration-test-only',role:'admin'})});
      assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/announcements');cookie=r.headers.get('set-cookie').split(';')[0];
      const page=await send('/announcements');assert.equal(page.status,200);assert.ok((await page.text()).includes('class="announcement-app"'));
    });
    await t.test('logout clears session and protects announcements and legacy dashboard',async()=>{
      const r=await send('/logout');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login');assert.ok(r.headers.get('set-cookie').includes('Expires='));
      for(const path of ['/announcements','/notifications','/dashboard']){const next=await send(path);assert.equal(next.status,302);assert.equal(next.headers.get('location'),'/login');}
    });

    await t.test('failed sign-in renders an understandable error without reflecting the password',async()=>{
      const r=await send('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.invalid',password:'incorrect-test-password'})});
      assert.equal(r.status,401);const html=await r.text();assert.ok(html.includes('Email or password is incorrect.'));assert.ok(html.includes('role="alert"'));assert.ok(!html.includes('incorrect-test-password'));
    });
    await t.test('duplicate registration is rejected without creating a user',async()=>{
      User.findOne=async()=>user;
      const previousCreate=User.create;let created=false;User.create=async()=>{created=true;return user;};
      try{const r=await send('/register',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Duplicate',email:' TEST@example.invalid ',password:'not-reflected'})});assert.equal(r.status,409);assert.ok((await r.text()).includes('already uses this email'));assert.equal(created,false);}finally{User.create=previousCreate;}
    });
    await t.test('registration validates email, name length and bcrypt byte limit on the server',async()=>{
      for(const data of [{name:'Test',email:'invalid',password:'test'},{name:'x'.repeat(256),email:'valid@example.invalid',password:'test'},{name:'Test',email:'valid@example.invalid',password:'é'.repeat(40)}]){
        const r=await send('/register',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});assert.equal(r.status,400);
      }
    });
    await t.test('database unique conflict races receive a friendly response',async()=>{
      const previousCreate=User.create;User.findOne=async()=>null;User.create=async()=>{throw Object.assign(new Error('Private database details'),{name:'SequelizeUniqueConstraintError'});};
      try{const r=await send('/register',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Test',email:'race@example.invalid',password:'test'})});assert.equal(r.status,409);assert.ok(!(await r.text()).includes('Private database'));}finally{User.create=previousCreate;User.findOne=async()=>user;}
    });
    await t.test('root enters the workspace and successful login rotates the session',async()=>{
      const r=await send('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.invalid',password:'test-only-password'})});assert.equal(r.status,302);const first=r.headers.get('set-cookie').split(';')[0];cookie=first;
      const again=await send('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.invalid',password:'test-only-password'})});assert.equal(again.status,302);cookie=again.headers.get('set-cookie').split(';')[0];assert.ok(first!==cookie);const root=await send('/');assert.equal(root.headers.get('location'),'/dashboard');
    });
    await t.test('theme and form scripts are served',async()=>{for(const path of ['/announcements.css','/announcement-form.js'])assert.equal((await send(path)).status,200);});
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));User.findOne=original.userOne;User.findByPk=original.userPk;User.findAll=original.userAll;User.create=original.userCreate;Announcement.findAll=original.annAll;Announcement.findByPk=original.annPk;Notification.findAll=original.notAll;}
});



