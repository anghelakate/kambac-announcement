import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/userModel.js';
import { loginUser, registerUser } from '../controllers/authController.js';
const response=()=>({code:200,status(code){this.code=code;return this;},send(body){this.body=body;}});
test('authentication handles missing database without leaking diagnostics',async()=>{
  const originals={find:User.findOne,create:User.create,log:console.error}; const messages=[];
  console.error=message=>messages.push(message);
  const fail=async()=>{throw Object.assign(new Error('PRIVATE CONNECTION STRING'),{name:'SequelizeHostNotFoundError'});};
  User.findOne=fail;User.create=fail;
  try {
    const login=response();await loginUser({body:{email:'test@example.invalid',password:'test-only'},session:{}},login);assert.equal(login.code,503);assert.ok(!login.body.includes('PRIVATE'));
    const register=response();await registerUser({body:{name:'Test',email:'test@example.invalid',password:'test-only'},session:{}},register);assert.equal(register.code,503);assert.ok(!register.body.includes('PRIVATE'));
    assert.deepEqual(messages,['[announcements:login] SequelizeHostNotFoundError','[announcements:registration] SequelizeHostNotFoundError']);
    for(const method of [loginUser,registerUser]){const r=response();await method({body:{},session:{}},r);assert.equal(r.code,400);}
  }finally{User.findOne=originals.find;User.create=originals.create;console.error=originals.log;}
});
