// Triggering GitHub sync for Cloud Run deployment 13
console.log("Starting server script...");
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// --- Google Auth Setup ---
let auth;
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar'
];

if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join('\n') : undefined,
    },
    scopes: SCOPES,
  });
} else if (fs.existsSync(path.join(process.cwd(), 'google-credentials.json'))) {
  auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'google-credentials.json'),
    scopes: SCOPES,
  });
} else {
  console.warn("WARNING: No Google credentials found. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in your environment, or provide a google-credentials.json file.");
  auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
  });
}

const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1PCt0tb-HTwbqlI2uCX4qC71ewZ1tgbAEmLcquTo--2U';
const CALENDAR_ID = process.env.CALENDAR_ID || 'ron.cuales87@gmail.com';

// Helper to append row and create sheet if it doesn't exist
async function appendRowToSheet(spreadsheetId: string, sheetName: string, range: string, values: any[]) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!${range}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
  } catch (error: any) {
    if (error.message && error.message.includes('Unable to parse range')) {
      console.log(`Sheet '${sheetName}' not found. Creating it...`);
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName
                }
              }
            }]
          }
        });
        // Try appending again
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!${range}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [values] }
        });
      } catch (createError) {
        console.error(`Failed to create sheet ${sheetName} or append data:`, createError);
        throw createError;
      }
    } else {
      throw error;
    }
  }
}

// Helper to fetch all data from all sheets
async function getAllSheetsData() {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetTitles = meta.data.sheets?.map(s => s.properties?.title) || [];
    
    const allData: Record<string, any[]> = {};
    for (const title of sheetTitles) {
      if (!title) continue;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: title,
      });
      allData[title] = response.data.values || [];
    }
    return allData;
  } catch (error) {
    console.error("Error fetching sheets:", error);
    return null;
  }
}

// Helper to update tenant code in the spreadsheet
async function updateTenantCode(email: string, code: string) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Tenants',
    });
    const rows = response.data.values || [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Assuming Email is in column C (index 2)
      if (row[2] && row[2].toLowerCase() === email.toLowerCase()) {
        const existingCode = row[3] || ''; // Column D (index 3) is Tenant Code
        const newCode = existingCode ? `${existingCode}, ${code}` : code;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Tenants!D${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[newCode]] }
        });
        break;
      }
    }
  } catch (error) {
    console.error("Failed to update tenant code in spreadsheet:", error);
  }
}

// --- Nodemailer Setup ---
async function sendEmail(to: string, subject: string, text: string, attachment?: { filename: string, content: Buffer }, html?: string, retries = 3) {
  let transporter;
  
  const smtpEmail = process.env.SMTP_EMAIL || 'ron.cuales87@gmail.com';
  const smtpPass = process.env.SMTP_PASSWORD || 'aqgwbisa jkiryzob'.replace(/\s/g, '');

  if (smtpEmail && smtpPass) {
    transporter = nodemailer.createTransport({
      service: 'gmail', // Assuming Gmail, can be changed
      auth: {
        user: smtpEmail,
        pass: smtpPass
      }
    });
  } else {
    // Fallback to Ethereal for testing if no credentials provided
    console.log("No SMTP credentials found. Using Ethereal Email for testing.");
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  const mailOptions: any = {
    from: `"Exclusive Rental Support" <${smtpEmail || 'support@exclusiverental.ca'}>`,
    to,
    subject,
    text,
  };

  if (html) {
    mailOptions.html = html;
  }

  if (attachment) {
    mailOptions.attachments = [attachment];
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      if (!smtpEmail) {
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      }
      return info;
    } catch (error: any) {
      console.error(`Email sending failed (Attempt ${attempt}/${retries}):`, error.message);
      if (attempt === retries) {
        throw error;
      }
      // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
}

import puppeteer from 'puppeteer';

// --- PDF Generation ---
async function generateReceiptPDF(tenantName: string, propertyAddress: string, amount: string, year: string) {
  console.log(`[PDF] Starting generation for ${tenantName} at ${propertyAddress} (${year})`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  });
  
  try {
    const page = await browser.newPage();
    // Set a longer timeout for slow asset loading
    page.setDefaultNavigationTimeout(60000);
  
    const receiptNo = `INV/${Math.floor(Math.random() * 10000)}/MSA/V/${year}`;
    const currentDate = new Date().toLocaleDateString('en-CA');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: Letter;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            padding: 30px;
            color: #333;
            box-sizing: border-box;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .logo-container {
            width: 200px;
          }
          .logo-container img {
            width: 100%;
            height: auto;
          }
          .company-details {
            text-align: right;
            font-size: 9px;
            line-height: 1.3;
            color: #555;
          }
          .title-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
          }
          .title {
            font-size: 36px;
            font-weight: 900;
            line-height: 0.9;
            color: #333;
            text-transform: uppercase;
          }
          .receipt-meta {
            font-size: 11px;
            line-height: 1.5;
          }
          .received-from {
            margin-bottom: 20px;
          }
          .received-from h3 {
            font-size: 14px;
            margin-bottom: 5px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 110px 1fr;
            gap: 4px;
            font-size: 11px;
          }
          .table-container {
            margin-bottom: 20px;
          }
          .table-container h3 {
            font-size: 13px;
            margin-bottom: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          th, td {
            border: 1px solid #333;
            padding: 8px;
            text-align: center;
          }
          th {
            font-weight: bold;
          }
          .footer-section {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
          }
          .method-note h4 {
            font-size: 13px;
            margin-bottom: 4px;
          }
          .method-note p {
            font-size: 11px;
            margin: 0;
          }
          .signature-area {
            text-align: right;
            margin-top: 30px;
          }
          .signature-text {
            font-family: 'Brush Script MT', cursive, sans-serif;
            font-size: 22px;
            color: #555;
          }
          /* Decorative corners */
          .decor-bottom-left {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 200px;
            height: 150px;
            z-index: -1;
            opacity: 0.1;
          }
        </style>
      </head>
      <body>
        <div class="decor-bottom-left">
          <svg width="100%" height="100%" viewBox="0 0 250 200">
            <polygon points="0,200 0,80 120,200" fill="#1a7fc3" />
            <polygon points="60,200 250,10 250,200" fill="#eb5f2e" />
          </svg>
        </div>
        
        <div class="header">
          <div class="logo-container">
            <img src="https://www.exclusiverental.ca/wp-content/uploads/2025/08/er_logo.svg" alt="Exclusive Rental" />
          </div>
          <div class="company-details">
            123 St. George St. Rear London Ontario<br>
            Phone: +1519-933-9331 | Email: accounting@exclusiverental.ca<br>
            Website: www.exclusiverental.ca
          </div>
        </div>

        <div class="title-section">
          <div class="title">RENT<br>RECEIPT</div>
          <div class="receipt-meta">
            <strong>Receipt No.:</strong> ${receiptNo}<br>
            <strong>Payment Year:</strong> ${year}<br>
            <strong>Date Issued:</strong> ${currentDate}
          </div>
        </div>

        <div class="received-from">
          <h3>Received From:</h3>
          <div class="info-grid">
            <div>Name:</div>
            <div><strong>${tenantName}</strong></div>
            <div>Property Address:</div>
            <div><strong>${propertyAddress}</strong></div>
          </div>
        </div>

        <div class="table-container">
          <h3>Payment Details:</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 10%;">No</th>
                <th style="width: 50%;">Rental Address</th>
                <th style="width: 40%;">Amount Monthly Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>${propertyAddress}</td>
                <td>${amount}</td>
              </tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
            </tbody>
          </table>
        </div>

        <div class="footer-section">
          <div class="method-note">
            <h4>Payment Method:</h4>
            <p>Electronic / Pre-authorized</p>
          </div>
          <div class="method-note">
            <h4>Note:</h4>
            <p>Please keep this receipt for your records.</p>
          </div>
        </div>

        <div class="signature-area">
          <div class="signature-text">Exclusive Rental accounting</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error("[PDF] Error generating receipt:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

// --- API Routes ---

app.get('/api/config', (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("[CONFIG] GEMINI_API_KEY is missing in environment variables.");
  } else {
    console.log("[CONFIG] GEMINI_API_KEY found and being served to client.");
  }
  res.json({ apiKey: key });
});

app.get('/api/calendar/slots', async (req, res) => {
  try {
    const { preferredDate } = req.query;
    const timeZone = 'America/Toronto';
    const nowUTC = new Date();
    const nowZoned = toZonedTime(nowUTC, timeZone);

    let startDayZoned = new Date(nowZoned);
    let endDayZoned = new Date(nowZoned);

    if (preferredDate && typeof preferredDate === 'string') {
      const match = preferredDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        startDayZoned = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        endDayZoned = new Date(startDayZoned);
      } else {
        const parsedDate = new Date(preferredDate);
        if (!isNaN(parsedDate.getTime())) {
          startDayZoned = toZonedTime(parsedDate, timeZone);
          endDayZoned = new Date(startDayZoned);
        }
      }
    } else {
      // If no specific date, start from tomorrow
      startDayZoned = new Date(nowZoned.getTime() + 24 * 60 * 60 * 1000);
      endDayZoned = new Date(startDayZoned.getTime() + 14 * 24 * 60 * 60 * 1000); // Up to 14 days
    }

    startDayZoned.setHours(0, 0, 0, 0);
    endDayZoned.setHours(23, 59, 59, 999);

    const timeMinUTC = fromZonedTime(startDayZoned, timeZone);
    const timeMaxUTC = fromZonedTime(endDayZoned, timeZone);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMinUTC.toISOString(),
        timeMax: timeMaxUTC.toISOString(),
        timeZone: timeZone,
        items: [{ id: CALENDAR_ID }]
      }
    });

    const busySlots = response.data.calendars?.[CALENDAR_ID]?.busy || [];
    
    const availableSlots: any[] = [];
    
    // Generate slots day by day
    let currentDayZoned = new Date(startDayZoned);
    while (currentDayZoned <= endDayZoned) {
      let slotStartZoned = new Date(currentDayZoned);
      slotStartZoned.setHours(9, 0, 0, 0); // 9:00 AM Toronto
      
      const dayEndZoned = new Date(currentDayZoned);
      dayEndZoned.setHours(20, 0, 0, 0); // 8:00 PM Toronto
      
      while (slotStartZoned.getTime() + 30 * 60 * 1000 <= dayEndZoned.getTime()) {
        const slotStartUTC = fromZonedTime(slotStartZoned, timeZone);
        const slotEndUTC = new Date(slotStartUTC.getTime() + 30 * 60 * 1000);
        
        const isBusy = busySlots.some(busy => {
          const busyStart = new Date(busy.start!);
          const busyEnd = new Date(busy.end!);
          return (slotStartUTC < busyEnd && slotEndUTC > busyStart);
        });

        if (!isBusy && slotStartUTC > nowUTC) {
          availableSlots.push({
            display: format(slotStartZoned, 'EEE, MMM d, h:mm a'),
            value: slotStartUTC.toISOString()
          });
        }
        
        // Move to next slot: 30 min showing + 15 min interval = 45 mins
        slotStartZoned = new Date(slotStartZoned.getTime() + 45 * 60 * 1000);
      }
      
      // Move to next day
      currentDayZoned = new Date(currentDayZoned.getTime() + 24 * 60 * 60 * 1000);
    }

    res.json({ success: true, slots: availableSlots.slice(0, 30) }); // Return up to 30 slots
  } catch (error: any) {
    console.error("Calendar error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/calendar/book', async (req, res) => {
  const { name, email, phone, datetime, properties, ticketNumber, remarks } = req.body;
  try {
    const startTime = new Date(datetime);
    
    // Check if the date is valid
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid datetime provided. Please provide a valid ISO string." });
    }

    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min showing

    // Format properties for calendar description
    const propertiesList = properties.split(',').map((p: string) => p.trim()).join('\n');

    const event = {
      summary: `Showing: ${name}`,
      description: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nProperties:\n${propertiesList}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Toronto',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Toronto',
      },
    };

    let eventLink = null;
    try {
      const response = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });
      eventLink = response.data.htmlLink;
    } catch (calError: any) {
      console.error("Failed to insert event into Google Calendar:", calError);
      // We continue to send the email even if calendar insert fails
    }

    // Send confirmation email to the user
    const dateStr = startTime.toLocaleString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto'
    });
    
    let emailSent = true;

    // Send admin notification email
    const adminHtmlContent = `
      <h2>New Booking Confirmed</h2>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Ticket Number</th><td>${ticketNumber || 'N/A'}</td></tr>
        <tr><th>Client Name</th><td>${name}</td></tr>
        <tr><th>Contact Number</th><td>${phone}</td></tr>
        <tr><th>Email Address</th><td>${email}</td></tr>
        <tr><th>Selected Properties</th><td>${properties}</td></tr>
        <tr><th>Confirmed Date and Time</th><td>${dateStr}</td></tr>
        <tr><th>Remarks</th><td>${remarks || 'N/A'}</td></tr>
      </table>
    `;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `New Booking Confirmed: ${ticketNumber || name}`,
        `New Booking Confirmed\n\nTicket Number: ${ticketNumber || 'N/A'}\nClient Name: ${name}\nContact Number: ${phone}\nEmail Address: ${email}\nSelected Properties: ${properties}\nConfirmed Date and Time: ${dateStr}\nRemarks: ${remarks || 'N/A'}`,
        undefined,
        adminHtmlContent
      );
    } catch (adminEmailError) {
      console.error("Failed to send admin notification email:", adminEmailError);
      emailSent = false;
    }

    res.json({ success: true, eventLink, emailSent });
  } catch (error: any) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sheets', async (req, res) => {
  const data = await getAllSheetsData();
  if (data) {
    res.json({ success: true, data });
  } else {
    res.status(500).json({ success: false, error: "Failed to fetch sheets data" });
  }
});

app.post('/api/receipt', async (req, res) => {
  const { email, name, address, amount, year } = req.body;
  try {
    const pdfBuffer = await generateReceiptPDF(name, address, amount, year);
    
    const userEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a7fc3;">Your Rent Receipt</h2>
        <p>Hello ${name},</p>
        <p>Please find attached your rent receipt for <strong>${address}</strong> for the year <strong>${year}</strong>.</p>
        <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>Exclusive Rental Accounting Team</strong><br>
        <a href="https://www.exclusiverental.ca" style="color: #eb5f2e;">www.exclusiverental.ca</a><br>
        +1 519-933-9331</p>
      </div>
    `;

    await sendEmail(
      email,
      'Your Rent Receipt - Exclusive Rental',
      `Hello ${name},\n\nPlease find attached your rent receipt for ${address} (${year}).\n\nThank you,\nExclusive Rental`,
      { filename: `Rent_Receipt_${year}.pdf`, content: pdfBuffer },
      userEmailHtml
    );

    // Send admin notification
    const adminHtmlContent = `
      <h2>Rent Receipt Generated</h2>
      <p>A rent receipt has been generated and sent to a tenant.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Tenant Name</th><td>${name}</td></tr>
        <tr><th>Email</th><td>${email}</td></tr>
        <tr><th>Property Address</th><td>${address}</td></tr>
        <tr><th>Amount</th><td>$${amount}</td></tr>
        <tr><th>Year</th><td>${year}</td></tr>
        <tr><th>Date Generated</th><td>${new Date().toLocaleString()}</td></tr>
      </table>
    `;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `Rent Receipt Generated: ${name} - ${address}`,
        `A rent receipt has been generated and sent to a tenant.\n\nTenant Name: ${name}\nEmail: ${email}\nProperty Address: ${address}\nAmount: $${amount}\nYear: ${year}`,
        undefined,
        adminHtmlContent
      );
    } catch (adminEmailError) {
      console.error("Failed to send admin notification for receipt:", adminEmailError);
    }

    res.json({ success: true, message: "Receipt sent successfully." });
  } catch (error: any) {
    console.error("Receipt error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ticket', async (req, res) => {
  const { userName, email, callbackNumber, issueDescription, ticketNumber } = req.body;
  try {
    const date = new Date().toLocaleString();
    const htmlContent = `
      <h2>New Support Ticket</h2>
      <p>A new support ticket has been created by Exie.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Ticket Number</th><td>${ticketNumber}</td></tr>
        <tr><th>Name</th><td>${userName}</td></tr>
        <tr><th>Email</th><td>${email || 'N/A'}</td></tr>
        <tr><th>Callback Number</th><td>${callbackNumber}</td></tr>
        <tr><th>Details</th><td>${issueDescription}</td></tr>
        <tr><th>Date Submitted</th><td>${date}</td></tr>
      </table>
    `;
    
    let emailSent = true;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `New Support Ticket: ${ticketNumber}`,
        `A new support ticket has been created by Exie.\n\nTicket: ${ticketNumber}\nName: ${userName}\nEmail: ${email || 'N/A'}\nCallback Number: ${callbackNumber}\nDetails: ${issueDescription}\n\nPlease reach out to them.`,
        undefined,
        htmlContent
      );
    } catch (emailError) {
      console.error("Failed to send email for ticket:", emailError);
      emailSent = false;
    }

    // Send confirmation email to the user
    if (email) {
      const userHtmlContent = `
        <h2>Support Ticket Created</h2>
        <p>Hi ${userName},</p>
        <p>Thank you for reaching out to Exclusive Rental. We have successfully created your support ticket.</p>
        <p><strong>Ticket Number:</strong> ${ticketNumber}</p>
        <p>Our team will review your ticket and reach out to you shortly.</p>
        <br/>
        <p>Best regards,<br/>Exclusive Rental Team</p>
      `;
      try {
        await sendEmail(
          email,
          `Your Support Ticket has been created - Ticket: ${ticketNumber}`,
          `Hi ${userName},\n\nThank you for reaching out to Exclusive Rental. We have successfully created your support ticket (Ticket: ${ticketNumber}).\n\nOur team will review your ticket and reach out to you shortly.\n\nBest regards,\nExclusive Rental Team`,
          undefined,
          userHtmlContent
        );
      } catch (userEmailError) {
        console.error("Failed to send confirmation email to user:", userEmailError);
      }
    }

    try {
      await appendRowToSheet(
        SPREADSHEET_ID,
        'Tickets',
        'A:F',
        [ticketNumber, userName, email || 'N/A', callbackNumber, issueDescription, date]
      );
    } catch (sheetError) {
      console.error("Failed to save ticket to spreadsheet:", sheetError);
      // We don't fail the request if the sheet doesn't exist, we just log it
    }

    res.json({ success: true, message: "Ticket created.", emailSent });
  } catch (error: any) {
    console.error("Ticket error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/lead', async (req, res) => {
  const { name, email, phone, propertyDescription, ticketNumber, showingDate } = req.body;
  try {
    const date = new Date().toLocaleString();
    
    // Send email notification for the new lead
    const htmlContent = `
      <h2>New Lead Captured</h2>
      <p>A new lead has been captured by Exie.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Ticket Number</th><td>${ticketNumber || 'N/A'}</td></tr>
        <tr><th>Name</th><td>${name}</td></tr>
        <tr><th>Email</th><td>${email}</td></tr>
        <tr><th>Phone</th><td>${phone}</td></tr>
        <tr><th>Request</th><td>${propertyDescription}</td></tr>
        <tr><th>Showing Date</th><td>${showingDate || 'N/A'}</td></tr>
        <tr><th>Date Submitted</th><td>${date}</td></tr>
      </table>
    `;
    let emailSent = true;
    
    // Only send admin email if it's NOT a confirmed booking (to avoid duplicate emails since bookShowingSlot sends one)
    if (!showingDate || showingDate === 'N/A') {
      try {
        await sendEmail(
          'ron.cuales87@gmail.com',
          `New Lead Captured: ${ticketNumber || name}`,
          `A new lead has been captured by Exie.\n\nTicket: ${ticketNumber || 'N/A'}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nRequest: ${propertyDescription}\nShowing Date: ${showingDate || 'N/A'}\nDate Submitted: ${date}\n\nPlease reach out to them.`,
          undefined,
          htmlContent
        );
      } catch (emailError) {
        console.error("Failed to send email for lead:", emailError);
        emailSent = false;
      }
    }

    // Send confirmation email to the user
    if (email) {
      const userHtmlContent = `
        <h2>Request Received</h2>
        <p>Hi ${name},</p>
        <p>Thank you for reaching out to Exclusive Rental. We have successfully received your request (Ticket: <strong>${ticketNumber || 'N/A'}</strong>).</p>
        <p>Our team will review your request and reach out to you shortly.</p>
        <br/>
        <p>Best regards,<br/>Exclusive Rental Team</p>
      `;
      try {
        await sendEmail(
          email,
          `Your Request has been received - Ticket: ${ticketNumber || 'N/A'}`,
          `Hi ${name},\n\nThank you for reaching out to Exclusive Rental. We have successfully received your request (Ticket: ${ticketNumber || 'N/A'}).\n\nOur team will review your request and reach out to you shortly.\n\nBest regards,\nExclusive Rental Team`,
          undefined,
          userHtmlContent
        );
      } catch (userEmailError) {
        console.error("Failed to send confirmation email to user:", userEmailError);
      }
    }

    try {
      await appendRowToSheet(
        SPREADSHEET_ID,
        'Leads',
        'A:G',
        [ticketNumber || 'N/A', name, email, phone, propertyDescription, showingDate || 'N/A', date]
      );
    } catch (sheetError) {
      console.error("Failed to save lead to spreadsheet:", sheetError);
    }
    
    res.json({ success: true, message: "Lead saved.", emailSent });
  } catch (error: any) {
    console.error("Lead saving error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    await sendEmail(
      email,
      'Your Verification Code - Exclusive Rental',
      `Hello,\n\nYour verification code is: ${code}\n\nThank you,\nExclusive Rental`
    );

    // Update the tenant code in the spreadsheet
    await updateTenantCode(email, code);

    // Send admin notification
    const adminHtmlContent = `
      <h2>Verification Code Requested</h2>
      <p>A verification code was requested by a tenant.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Email</th><td>${email}</td></tr>
        <tr><th>Code Sent</th><td>${code}</td></tr>
        <tr><th>Date Requested</th><td>${new Date().toLocaleString()}</td></tr>
      </table>
    `;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `Verification Code Requested: ${email}`,
        `A verification code was requested by a tenant.\n\nEmail: ${email}\nCode Sent: ${code}`,
        undefined,
        adminHtmlContent
      );
    } catch (adminEmailError) {
      console.error("Failed to send admin notification for verification code:", adminEmailError);
    }

    res.json({ success: true, message: "Code sent successfully." });
  } catch (error: any) {
    console.error("Send code error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/maintenance', async (req, res) => {
  const { propertyAddress, phone, issueDescription, location, ticketNumber, remarks } = req.body;
  try {
    const date = new Date().toLocaleString();
    
    const htmlContent = `
      <h2>New Maintenance Request</h2>
      <p>A new maintenance ticket has been created.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Ticket Number</th><td>${ticketNumber}</td></tr>
        <tr><th>Property Address</th><td>${propertyAddress}</td></tr>
        <tr><th>Phone Number</th><td>${phone}</td></tr>
        <tr><th>Issue Description</th><td>${issueDescription}</td></tr>
        <tr><th>Location</th><td>${location || 'N/A'}</td></tr>
        <tr><th>Remarks</th><td>${remarks || 'N/A'}</td></tr>
        <tr><th>Date Submitted</th><td>${date}</td></tr>
      </table>
    `;
    
    let emailSent = true;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `New Maintenance Ticket: ${ticketNumber}`,
        `A new maintenance ticket has been created.\n\nTicket: ${ticketNumber}\nAddress: ${propertyAddress}\nPhone: ${phone}\nDetails: ${issueDescription}\nLocation: ${location || 'N/A'}\nRemarks: ${remarks || 'N/A'}`,
        undefined,
        htmlContent
      );
    } catch (emailError) {
      console.error("Failed to send email for maintenance ticket:", emailError);
      emailSent = false;
    }

    try {
      const fullIssueDescription = location && location !== 'N/A' ? `${issueDescription} (Location: ${location})` : issueDescription;
      await appendRowToSheet(
        SPREADSHEET_ID,
        'Maintenance',
        'A:G',
        [ticketNumber, phone, propertyAddress, fullIssueDescription, date, 'Open', remarks || 'N/A']
      );
    } catch (sheetError) {
      console.error("Failed to save maintenance ticket to spreadsheet:", sheetError);
    }

    res.json({ success: true, message: "Maintenance ticket created.", emailSent });
  } catch (error: any) {
    console.error("Maintenance ticket error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/maintenance/followup', async (req, res) => {
  const { ticketNumber, propertyAddress, phone, issueDescription, location, remarks, date, status, notes } = req.body;
  try {
    const htmlContent = `
      <h2>Maintenance Ticket Follow-up</h2>
      <p>A tenant has requested a follow-up on an existing maintenance ticket.</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Ticket Number</th><td>${ticketNumber}</td></tr>
        <tr><th>Property Address</th><td>${propertyAddress || 'N/A'}</td></tr>
        <tr><th>Phone Number</th><td>${phone || 'N/A'}</td></tr>
        <tr><th>Issue Description</th><td>${issueDescription || 'N/A'}</td></tr>
        <tr><th>Location</th><td>${location || 'N/A'}</td></tr>
        <tr><th>Remarks</th><td>${remarks || 'N/A'}</td></tr>
        <tr><th>Date Submitted</th><td>${date || 'N/A'}</td></tr>
        <tr><th>Status</th><td>${status || 'N/A'}</td></tr>
        <tr><th>Notes</th><td>${notes || 'N/A'}</td></tr>
      </table>
    `;
    
    let emailSent = true;
    try {
      await sendEmail(
        'ron.cuales87@gmail.com',
        `FOLLOW UP TICKET ID: ${ticketNumber}`,
        `A tenant has requested a follow-up on an existing maintenance ticket.\n\nTicket: ${ticketNumber}\nAddress: ${propertyAddress || 'N/A'}\nPhone: ${phone || 'N/A'}\nDetails: ${issueDescription || 'N/A'}\nLocation: ${location || 'N/A'}\nRemarks: ${remarks || 'N/A'}\nDate Submitted: ${date || 'N/A'}\nStatus: ${status || 'N/A'}\nNotes: ${notes || 'N/A'}`,
        undefined,
        htmlContent
      );
    } catch (emailError) {
      console.error("Failed to send email for maintenance follow-up:", emailError);
      emailSent = false;
    }

    res.json({ success: true, message: "Maintenance follow-up sent.", emailSent });
  } catch (error: any) {
    console.error("Maintenance follow-up error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve static files from the current directory
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT as number, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
