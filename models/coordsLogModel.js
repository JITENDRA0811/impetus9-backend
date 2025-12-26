const mongoose=require('mongoose');
const CoordsLogSchema=new mongoose.Schema({
    eventName: {
        type:String,
        required:true,
        unique: true
    },
    vCardsDownloaded:{
        type:Boolean,
        default:false
    },
    firstDownloaderName:{
        type:String,
        default:null
    },
    downloadTime:{
        type:Date,
        default:null
    }
})
module.exports=mongoose.model('CoordinatorLog',CoordsLogSchema);