const express=require('express');
const router=express.Router();
const handleDownload=require('../middleware/download');

router.post('/download',handleDownload);
module.exports = router;