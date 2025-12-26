const axios=require('axios');
module.exports=async function verifyCaptcha(token) {
    if(process.env.NODE_ENV==="development"){
        console.log("Dev Mode: Skipping Captcha Verification");
        return true; 
    }
    if(!token) return false;
    try{
        const response=await axios.post(
            "https://hcaptcha.com/siteverify",
            new URLSearchParams({
                secret:process.env.HCAPTCHA_SECRET,
                response:token
            })
        );
        const{success}=response.data;
        return success===true;
    } catch (error){
        console.error("Captcha Verification Error:",error.message);
        return false;
    }
};