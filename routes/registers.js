const express=require('express')
const router=express.Router()
const multer = require('multer'); 
const path = require('path'); 
const fs = require('fs');
const registerModel=require('../models/registerModel')
const verifyCaptcha=require('../middleware/verifyCaptcha')
const rateLimiter=require('../middleware/rateLimiter')
const allowedEvents=require('../allowedEvents')

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    }
});

//route
router.post("/",rateLimiter,upload.single('paymentScreenshot'), async(req,res)=>{
    try{
        const data = prepareRegistrationPayload(req);
        const{
            eventName,
            teamName,
            capName,
            capPhone,
            capRoll,
            teamMembers,
            captchaToken,
            deviceFingerprint,
            participantType,
        }=data;
        if(!allowedEvents.has(eventName)){
            return res.status(400).json({error:"Invalid Event"})
        }
        if(!teamName||!capName||!capPhone||!deviceFingerprint){
            return res.status(400).json({error:"Missing required fields"});
        }
        const captachaValid=await verifyCaptcha(captchaToken);
        if(!captachaValid){
            return res.status(400).json({error:"captcha verification failed"});
        }
        const deviceCount=await registerModel.countDocuments({deviceFingerprint:deviceFingerprint})
        if(deviceCount>=5){
            return res.status(429).json({
                error:"Device Limit Reached: You have registered too many times from this device"
            })
        }

        //controller
        const register=new registerModel(data);
        await register.save();
        if (participantType === "EXTERNAL") {
            return res.status(201).json({
                success: true,
                message: "Registration Submitted for Verification",
                receiptId: "PENDING", 
                status: "PENDING"
            });
        }
        return res.status(201).json({
            success:true,
            message: "Registration Successful",
            receiptId: register.receiptId,
            status: "VERIFIED"
        });

    }
    catch (err){
        if (err.code===11000) {
            const field=Object.keys(err.keyPattern)[0];
            if (field==='capRoll'){
                 return res.status(409).json({error:'This Roll Number is already registered for this event.'});
            }
            return res.status(409).json({
                error:'Duplicate Registration: This Captain/Phone is already registered for this event.'
            });
        }
        if(err.name==='ValidationError'){
            return res.status(400).json({error: err.message});
        }
        return res.status(400).json({
            error:err.message || "Registration Failed"
        });
    }
});

module.exports=router;

function prepareRegistrationPayload(req) {
    // If a file was uploaded, we know it's an External Multipart request
    if (req.file) {
        try {
            return {
                ...req.body,
                // FormData sends objects as strings, so we must parse them
                teamMembers: req.body.teamMembers ? JSON.parse(req.body.teamMembers) : [],
                captain: req.body.captain ? JSON.parse(req.body.captain) : undefined,
                
                // Add the file path and enforce type
                paymentScreenshot: req.file.path,
                participantType: "EXTERNAL"
            };
        } catch (e) {
            throw new Error("Invalid Data Format: Could not parse FormData JSON");
        }
    }
    
    // Default for Internal Users (Pure JSON)
    return req.body;
}