import { randomBytes, timingSafeEqual } from "node:crypto";
import { User } from "../models/userModel.js";
import { logAnnouncementError } from "../services/announcementErrors.js";
import { initials } from "../services/workspaceData.js";
export async function announcementAccess(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  try {
    req.currentUser = await User.findByPk(req.session.userId);
    if (!req.currentUser) return res.status(401).send("Please sign in again.");
    res.locals.account = { id: req.currentUser.id, name: req.currentUser.name, email: req.currentUser.email, role: req.currentUser.role, initials: initials(req.currentUser.name) };
    req.session.announcementCsrf ||= randomBytes(32).toString("hex");
    res.locals.csrf = req.session.announcementCsrf;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const token = req.body?._csrf;
      if (typeof token !== "string" || Buffer.byteLength(token) !== Buffer.byteLength(req.session.announcementCsrf) || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.announcementCsrf))) return res.status(403).send("Invalid form token. Reload the page and try again.");
    }
    next();
  } catch (error) { logAnnouncementError('access', error); res.status(503).send("Announcements are temporarily unavailable."); }
}

