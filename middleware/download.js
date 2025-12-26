// middleware/download.js
const ExcelJS = require('exceljs');
const registerModel = require('../models/registerModel');
const CoordinatorLog = require('../models/coordsLogModel');

// --- Helper: vCard Generator ---
const generateVCard = (name, phone, filename) => {
    return `BEGIN:VCARD
VERSION:3.0
FN:${filename}
N:;${filename};;;
TEL;TYPE=CELL:${phone}
END:VCARD
`;
};

const handleDownload = async (req, res) => {
    try {
        const { eventName,coordsValue, coordinatorName, passkey } = req.body;

        // 1. Verify Passkey
        const envKey = `PASSKEY_${coordsValue.toUpperCase()}`;
        if (!process.env[envKey] || process.env[envKey] !== passkey) {
            return res.status(401).json({ error: "Invalid Passkey" });
        }

        const registrations = await registerModel.find({ eventName })
            .sort({ createdAt: -1 })
            .lean();

        // --- NEW CHECK: If no data found, stop here ---
        if (!registrations || registrations.length === 0) {
            return res.status(200).json({ 
                success: false, 
                message: "No one registered yet!" 
            });
        }

        // 2. ATOMIC LOCK CHECK
        let existingLog = await CoordinatorLog.findOne({ eventName });
        if (!existingLog) {
            try {
                existingLog = await CoordinatorLog.create({ eventName });
            } catch (e) {
                existingLog = await CoordinatorLog.findOne({ eventName });
            }
        }

        let isFirstDownload = false;
        let logDetails = existingLog;

        const lockResult = await CoordinatorLog.findOneAndUpdate(
            { eventName: eventName, vCardsDownloaded: false },
            { 
                $set: { 
                    vCardsDownloaded: true, 
                    firstDownloaderName: coordinatorName,
                    downloadTime: new Date()
                }
            },
            { new: true }
        );

        if (lockResult) {
            isFirstDownload = true;
            logDetails = lockResult;
        } else {
            isFirstDownload = false;
            logDetails = await CoordinatorLog.findOne({ eventName });
        };

        // 4. EXCEL GENERATION
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Participants');

        // A. Determine Max Team Size
        let maxTeamMembers = 0;
        registrations.forEach(reg => {
            if (reg.teamMembers && reg.teamMembers.length > maxTeamMembers) {
                maxTeamMembers = reg.teamMembers.length;
            }
        });

        // B. Define Columns
        const columns = [
            { header: 'Team Name', key: 'teamName', width: 25 },
            { header: 'Captain Name', key: 'capName', width: 20 },
            { header: 'Captain Phone', key: 'capPhone', width: 15 },
            { header: 'Captain Roll', key: 'capRoll', width: 15 },
            { header: 'Type', key: 'type', width: 10 },
            { header: 'Registered At', key: 'regAt', width: 20 },
        ];

        for (let i = 1; i <= maxTeamMembers; i++) {
            columns.push({ header: `Mem ${i} Name`, key: `m${i}Name`, width: 20 });
            columns.push({ header: `Mem ${i} Roll`, key: `m${i}Roll`, width: 15 });
            columns.push({ header: `Mem ${i} Phone`, key: `m${i}Phone`, width: 15 });
        }

        worksheet.columns = columns;

        // C. Add Data Rows (FIXED MAPPING HERE)
        registrations.forEach(reg => {
            let rowData = {
                teamName: reg.teamName,
                capName: reg.capName,
                capPhone: reg.capPhone,
                capRoll: reg.participantType === 'INTERNAL' ? reg.capRoll : 'EXTERNAL',
                type: reg.participantType,
                regAt: new Date(reg.createdAt).toLocaleString()
            };

            if (reg.teamMembers && Array.isArray(reg.teamMembers)) {
                reg.teamMembers.forEach((member, index) => {
                    const i = index + 1;
                    // UPDATED: Using memName, memRoll, memPhone to match your Schema
                    rowData[`m${i}Name`] = member.memName || '-';
                    rowData[`m${i}Roll`] = member.memRoll || '-';
                    rowData[`m${i}Phone`] = member.memPhone || '-';
                });
            }

            worksheet.addRow(rowData);
        });

        // Style Header
        worksheet.getRow(1).font = { bold: true };

        const buffer = await workbook.xlsx.writeBuffer();
        const base64Excel = buffer.toString('base64');

        // 5. vCard Logic (FIXED MAPPING HERE TOO)
        let vCardContent = "";
        let message = "";

        if (isFirstDownload) {
            message = "You are the first coordinator, You can download both Contacts and the Excel Sheet";
            
            registrations.forEach(reg => {
                const prefix = eventName.substring(0, 2).toLowerCase();
                let uniqueId;
                if (reg.participantType === 'INTERNAL') {
                    uniqueId = `${prefix}${reg.capRoll}`;
                } else {
                    const phoneSuffix = reg.capPhone.replace(/\D/g, '').slice(-8); 
                    uniqueId = `${prefix}EXT${phoneSuffix}`;
                }
                vCardContent += generateVCard(reg.capName, reg.capPhone, `${uniqueId}-1`);
                
                // UPDATED: Check for memPhone and memName
                if (reg.teamMembers && reg.teamMembers[0] && reg.teamMembers[0].memPhone) {
                    vCardContent += generateVCard(
                        reg.teamMembers[0].memName, 
                        reg.teamMembers[0].memPhone, 
                        `${uniqueId}-2`
                    );
                }
            });
        } else {
            const timeStr = new Date(logDetails.downloadTime).toLocaleString();
            message = `⚠ Alert : Contacts were ALREADY downloaded by *${logDetails.firstDownloaderName}*, At ${timeStr}.`;
        }

        return res.status(200).json({
            success: true,
            message: message,
            excelBase64: base64Excel,
            vcf: isFirstDownload ? vCardContent : null
        });

    } catch (err) {
        console.error("Download Middleware Error:", err);
        return res.status(500).json({ error: "Server Error processing download" });
    }
};

module.exports = handleDownload;