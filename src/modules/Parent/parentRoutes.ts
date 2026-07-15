import express from "express";
import * as controller from "./parentController";
const router=express.Router();
router.post("/portal/request-otp",controller.requestOtp); router.post("/portal/verify-otp",controller.verifyOtp); router.post("/portal/login",controller.login); router.get("/portal/data",controller.data);
router.get("/portal/chat/contacts",controller.chatContacts); router.get("/portal/chat/messages",controller.chatMessages); router.post("/portal/chat/messages",controller.sendChat);
router.get("/",controller.list); router.post("/",controller.create); router.put("/:id",controller.update);
export default router;
