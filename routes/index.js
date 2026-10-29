
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
    
import express from "express";
import { homePage } from "../controllers/homeController.js";
const router = express.Router();
router.get("/", homePage);

import { loginPage, registerPage, forgotPasswordPage, dashboardPage, loginUser, registerUser, logoutUser } from "../controllers/authController.js";
import {
  workspaceDashboard, accountPage, newAnnouncementPage,
  listAnnouncements,
  createAnnouncement,
  editAnnouncementPage,
  updateAnnouncement,
  archiveAnnouncement, restoreAnnouncement, detailAnnouncement, notificationsPage, openNotification,
  deleteAnnouncement
} from "../controllers/announcementController.js";

router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", announcementAccess, workspaceDashboard);
router.get("/account", announcementAccess, accountPage);
router.get("/logout", logoutUser);
import { announcementAccess } from "../middleware/announcementAccess.js";
router.use(["/announcement", "/announcements", "/notifications"], announcementAccess);
router.get("/notifications", notificationsPage);
router.post("/notifications/:id/open", openNotification);
router.get("/announcements/new", newAnnouncementPage);
router.get("/announcements/:id", detailAnnouncement);
router.post("/announcements/:id/archive", archiveAnnouncement);
router.post("/announcements/:id/restore", restoreAnnouncement);
router.get("/announcement", listAnnouncements);
router.get("/announcements", listAnnouncements);
router.post("/announcements", createAnnouncement);
router.get("/announcements/:id/edit", editAnnouncementPage);
router.post("/announcements/:id/edit", updateAnnouncement);
router.post("/announcements/:id/delete", deleteAnnouncement);

export default router;

