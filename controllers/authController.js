
      /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
import { Announcement } from "../models/announcementModel.js";
import { logAnnouncementError } from "../services/announcementErrors.js";
// Schema changes run explicitly with npm run migrate.

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const dashboardPage = (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.redirect("/announcements");
};

const authFailure=(req,res,view,code,message)=>{
  if(res.req)return res.status(code).render(view,{title:view==='login'?'Sign in':'Create account',formError:message,email:typeof req.body.email==='string'?req.body.email:'',name:typeof req.body.name==='string'?req.body.name:''});
  return res.status(code).send(message);
};
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return authFailure(req,res,'login',400,'Email and password are required.');
  try {
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user) return authFailure(req,res,'login',401,'Email or password is incorrect.');
  const match = await bcrypt.compare(password, user.password);
  if (!match) return authFailure(req,res,'login',401,'Email or password is incorrect.');
  await new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
  req.session.userId = user.id;
  res.redirect("/announcements");
  } catch (error) {
    logAnnouncementError('login', error);
    authFailure(req,res,'login',503,'Sign-in is temporarily unavailable. Please try again shortly.');
  }
};

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  if ([name, email, password].some(value => typeof value !== 'string' || !value.trim())) return authFailure(req,res,'register',400,'Name, email and password are required.');
  const normalizedEmail=email.trim().toLowerCase();
  if(name.trim().length>255||normalizedEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return authFailure(req,res,'register',400,'Enter a valid email address and a name of up to 255 characters.');
  if(Buffer.byteLength(password,'utf8')>72)return authFailure(req,res,'register',400,'Choose a password of at most 72 UTF-8 bytes.');
  try {
  if(await User.findOne({where:{email:normalizedEmail}}))return authFailure(req,res,'register',409,'An account already uses this email address. Please sign in instead.');
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hashed });
  await new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
  req.session.userId = user.id;
  res.redirect("/announcements");
  } catch (error) {
    if(error.name==='SequelizeUniqueConstraintError')return authFailure(req,res,'register',409,'An account already uses this email address. Please sign in instead.');
    logAnnouncementError('registration', error);
    authFailure(req,res,'register',503,'Registration is temporarily unavailable. Please try again later.');
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy(error => {
    if (error) {
      logAnnouncementError('logout', error);
      return res.status(503).send('Unable to sign out. Please try again.');
    }
    res.clearCookie('connect.sid');
    res.redirect("/login");
  });
};

