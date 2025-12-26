const express=require('express')
const router=express.Router()
const registerModel=require('../models/registerModel')
const verifyCaptcha=require('../middleware/verifyCaptcha')
const rateLimiter=require('../middleware/rateLimiter')
const allowedEvents=require('../allowedEvents')
//route
router.post("/",rateLimiter, async(req,res)=>{
    try{
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
        }=req.body;
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
        const register=new registerModel(req.body);
        await register.save();
        return res.status(201).json({
            success:true,
            message: "Registration Successful",
            receiptId: register.receiptId
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