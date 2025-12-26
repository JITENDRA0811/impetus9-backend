const rateLimit=require("express-rate-limit");
module.exports=rateLimit({
    windowMs:15*60*1000,
    max:10,
    standardHeaders:true,
    legacyHeaders:false,
    message:{ error:"Too many attempts from this device, please try again later."},
    keyGenerator:(req)=>{
        return req.body.deviceFingerprint || req['ip'];
    },
    validate:{
        ip:false,
        trustProxy:false
    }
});