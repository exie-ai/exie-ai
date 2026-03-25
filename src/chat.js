import { GoogleGenAI } from "@google/genai";

const chatButton = document.getElementById('chat-button');
const chatPanel = document.getElementById('chat-panel');
const closeButton = document.getElementById('close-button');
const minimizeButton = document.getElementById('minimize-button');
const maximizeButton = document.getElementById('maximize-button');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const floatingPrompts = document.getElementById('floating-prompts');
const promptPills = document.querySelectorAll('.prompt-pill');

// Knowledge Base Data
const knowledgeBase = {
  about: "Exclusive Rental is a dedicated property management and rental service focused on helping tenants find quality housing and assisting property owners in managing their rental properties efficiently. We specialize in student rentals, family homes, and shared accommodations, offering a wide range of options to suit different needs and lifestyles.",
  mission: "Our mission is to make renting simple, transparent, and stress-free for both tenants and property owners.",
  hours: "Our office hours are Monday to Friday, 9 AM to 5 PM.",
  maintenance: "Tenants can submit maintenance requests by contacting our office or using the tenant portal. A reference ticket ID will be generated to track the request. For urgent issues like leaks or no heat, please contact our office immediately.",
  receipt: "Yes, you can request a rent receipt. Verification may be required before a receipt is issued.",
  leasing: "To book a showing, we'll need your name, email, phone number, and preferred date and time. If no properties match right now, we can add you to our waiting list.",
  companyInfo: "Office Name: Exclusive Rental. Office Address: 123 St George St Rear, London, Ontario, Canada. Website: https://www.exclusiverental.ca/. Service Area: Primarily serving London, Ontario and surrounding areas. Phone Number: 519-933-9331",
  services: "OUR SERVICES: Property rentals and leasing, Property showings and scheduling, Tenant support and communication, Maintenance coordination and ticket management, Lead management and rental inquiries, Move in and move out assistance.",
  support: "OFFICE SUPPORT: Our team is committed to providing fast, reliable, and friendly service. Whether you are looking for a place to rent or need help with an existing property, we are here to assist you every step of the way."
};

const tenantDatabase = [
  { name: "Jason Stern", email: "jason@gmail.com", address: "132 St. George", amount: "$800.00", year: "2025" },
  { name: "Britta Stern", email: "briita@gmail.com", address: "361 Devnonshire", amount: "$900.00", year: "2026" },
  { name: "Jaime M", email: "jaime@gmail.com", address: "326 Sheffield", amount: "$500.00", year: "2024" },
  { name: "Ron C", email: "rcuales@yahoo.com", address: "321 Huron", amount: "$100.00", year: "2021" },
  { name: "Ron Cuales", email: "ron.cuales87@gmail.com", address: "100 Main Street", amount: "$1,200.00", year: "2026" }
];

let isChatOpen = false;
let hasInitialized = false;

// Generate a unique session ID for the backend
const sessionId = Math.random().toString(36).substring(2, 15);

function toggleChat() {
  if (isChatOpen) {
    chatPanel.classList.remove('hidden');
    chatPanel.classList.remove('minimized');
    floatingPrompts.classList.add('hidden');
    chatButton.classList.add('hidden');
    if (!hasInitialized) {
      initChat();
      hasInitialized = true;
    }
    setTimeout(() => chatInput.focus(), 300);
    window.parent.postMessage({ type: 'exie-chat-opened' }, '*');
  } else {
    chatPanel.classList.add('hidden');
    floatingPrompts.classList.remove('hidden');
    chatButton.classList.remove('hidden');
    window.parent.postMessage({ type: 'exie-chat-closed' }, '*');
  }
}

chatButton.addEventListener('click', () => {
  isChatOpen = !isChatOpen;
  toggleChat();
});

closeButton.addEventListener('click', () => {
  isChatOpen = false;
  toggleChat();
});

minimizeButton.addEventListener('click', () => {
  chatPanel.classList.toggle('minimized');
  chatPanel.classList.remove('maximized');
  if (chatPanel.classList.contains('minimized')) {
    window.parent.postMessage({ type: 'exie-chat-closed' }, '*');
  } else {
    window.parent.postMessage({ type: 'exie-chat-opened' }, '*');
  }
});

maximizeButton.addEventListener('click', () => {
  chatPanel.classList.toggle('maximized');
  chatPanel.classList.remove('minimized');
  if (chatPanel.classList.contains('maximized')) {
    window.parent.postMessage({ type: 'exie-chat-maximized' }, '*');
  } else {
    window.parent.postMessage({ type: 'exie-chat-unmaximized' }, '*');
  }
});

promptPills.forEach(pill => {
  pill.addEventListener('click', () => {
    const text = pill.getAttribute('data-flow');
    isChatOpen = true;
    toggleChat();
    
    setTimeout(() => {
      handleUserMessage(text, true);
    }, hasInitialized ? 50 : 100);
  });
});

function addMessage(text, sender, isHTML = false) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  if (isHTML) {
    msgDiv.innerHTML = text;
  } else {
    msgDiv.textContent = text;
  }
  chatMessages.appendChild(msgDiv);
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 10);
}

function initChat() {
  addMessage("Hi there! I'm Exie, a support agent here at Exclusive Rental. Who do I have the pleasure of speaking with today?", 'bot');
}

sendButton.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (text) {
    handleUserMessage(text);
    chatInput.value = '';
  }
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) {
      handleUserMessage(text);
      chatInput.value = '';
    }
  }
});

function handleUserMessage(text, isQuickAction = false) {
  addMessage(text, 'user');
  
  const existingActions = document.querySelector('.quick-actions');
  if (existingActions) existingActions.remove();

  setTimeout(() => callBackendAPI(isQuickAction ? `[User selected quick action: ${text}]` : text), 600);
}
window.handleUserMessage = handleUserMessage;

async function callBackendAPI(message) {
  // Show typing indicator
  const typingId = 'typing-' + Date.now();
  const typingHtml = `
    <div id="${typingId}" class="typing-indicator">
      <span>Exie is typing</span>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatMessages.insertAdjacentHTML('beforeend', typingHtml);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    if (!window.chatSession) {
      let apiKey = import.meta.env.VITE_API_KEY;
      if (!apiKey) {
        try {
          const res = await fetch('/api/config');
          const data = await res.json();
          apiKey = data.apiKey;
        } catch (e) {
          console.error("Failed to fetch API key", e);
        }
      }
      
      const ai = new GoogleGenAI({ apiKey: apiKey || 'missing_key' });
      console.log("[CHAT] Initializing chat session with API key:", apiKey ? "Present" : "Missing");
      window.chatSession = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          tools: [{
            functionDeclarations: [
              {
                name: "checkTenantEmail",
                description: "Check if a tenant's email exists in the database and return their details (the row data contains name, address, email, amount, year, etc.).",
                parameters: {
                  type: "OBJECT",
                  properties: { email: { type: "STRING" } },
                  required: ["email"]
                }
              },
              {
                name: "sendRentReceipt",
                description: "Generate and send a rent receipt PDF to the tenant's email.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    email: { type: "STRING" },
                    name: { type: "STRING" },
                    address: { type: "STRING" },
                    amount: { type: "STRING" },
                    year: { type: "STRING" }
                  },
                  required: ["email", "name", "address", "amount", "year"]
                }
              },
              {
                name: "createSupportTicket",
                description: "Create a support ticket for unknown information, maintenance, or property owner inquiries and email the team.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    userName: { type: "STRING" },
                    email: { type: "STRING", description: "The email address of the user." },
                    callbackNumber: { type: "STRING" },
                    issueDescription: { type: "STRING", description: "Details of the issue or inquiry. For property owners, include their email and property address here." },
                    ticketNumber: { type: "STRING" }
                  },
                  required: ["userName", "email", "callbackNumber", "issueDescription", "ticketNumber"]
                }
              },
              {
                name: "getAvailableProperties",
                description: "Get a list of available properties from the database.",
                parameters: {
                  type: "OBJECT",
                  properties: {},
                }
              },
              {
                name: "sendVerificationCode",
                description: "Send a 6-digit verification code to the tenant's email.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    email: { type: "STRING" },
                    code: { type: "STRING" }
                  },
                  required: ["email", "code"]
                }
              },
              {
                name: "createMaintenanceTicket",
                description: "Create a maintenance ticket, send an email to the team, and add it to the spreadsheet.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    propertyAddress: { type: "STRING" },
                    phone: { type: "STRING" },
                    issueDescription: { type: "STRING" },
                    location: { type: "STRING", description: "The specific location of the issue (e.g., under the kitchen sink). If not applicable, use 'N/A'." },
                    ticketNumber: { type: "STRING" },
                    remarks: { type: "STRING", description: "All responses provided by the tenant, troubleshooting steps taken, and any additional notes." }
                  },
                  required: ["propertyAddress", "phone", "issueDescription", "location", "ticketNumber", "remarks"]
                }
              },
              {
                name: "checkMaintenanceStatus",
                description: "Check the status of a maintenance ticket by its ticket number.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    ticketNumber: { type: "STRING" }
                  },
                  required: ["ticketNumber"]
                }
              },
              {
                name: "sendMaintenanceFollowUp",
                description: "Send a follow-up email to the team for an existing maintenance ticket.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    ticketNumber: { type: "STRING" },
                    propertyAddress: { type: "STRING" },
                    phone: { type: "STRING" },
                    issueDescription: { type: "STRING" },
                    location: { type: "STRING" },
                    remarks: { type: "STRING" },
                    date: { type: "STRING" },
                    status: { type: "STRING" },
                    notes: { type: "STRING" }
                  },
                  required: ["ticketNumber"]
                }
              },
              {
                name: "saveLeadToSpreadsheet",
                description: "Save a new lead's information to the Leads sheet in the database.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    email: { type: "STRING" },
                    phone: { type: "STRING" },
                    propertyDescription: { type: "STRING", description: "The description of the property the user is interested in." },
                    ticketNumber: { type: "STRING" },
                    showingDate: { type: "STRING", description: "The date the lead wants to book a showing. If it's a waiting list or no date was chosen, use 'N/A'." }
                  },
                  required: ["name", "email", "phone", "propertyDescription", "ticketNumber", "showingDate"]
                }
              },
              {
                name: "getAvailableShowingSlots",
                description: "Get a list of available 30-minute showing slots from the Google Calendar. You can optionally provide a preferredDate to check a specific day. DO NOT format the returned slots as HTML buttons in your response. The system will handle displaying them automatically.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    preferredDate: { type: "STRING", description: "The preferred date (e.g., '2026-03-28' or 'Saturday')." }
                  },
                }
              },
              {
                name: "bookShowingSlot",
                description: "Book a showing slot on the Google Calendar.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    email: { type: "STRING" },
                    phone: { type: "STRING" },
                    datetime: { type: "STRING", description: "The ISO string value of the selected slot." },
                    properties: { type: "STRING", description: "The properties the user wants to see." },
                    ticketNumber: { type: "STRING", description: "The generated ticket number for this booking." },
                    remarks: { type: "STRING", description: "Any remarks or notes about the booking." }
                  },
                  required: ["name", "email", "phone", "datetime", "properties", "ticketNumber"]
                }
              }
            ]
          }],
          systemInstruction: `You are Exie, a friendly, highly conversational, and human-like virtual support agent for Exclusive Rental.

CURRENT DATE AND TIME:
- The current date and time in London, Ontario (Eastern Time) is: ${new Date().toLocaleString('en-US', { timeZone: 'America/Toronto', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })}.
- Always use this current date and time as your reference point when the user says "today", "tomorrow", or mentions any specific day of the week.

BEHAVIOR & TONE:
- Always think like a human and understand the issue. Show empathy.
- Example: If the issue is a leak in the kitchen, think like a human, tell them to avoid using the kitchen sink for now, say sorry for the inconvenience, and ask if it is under the kitchen sink.
- DO NOT put any emoji or emoticons in your responses. Remove any tiny squares or broken characters.
- Be concise, helpful, and human-like. Format your responses using HTML tags like <br> for line breaks, <strong> for bold text, and <em> for italics, as your response will be rendered directly in an HTML chat window.
- FORMATTING CRITICAL RULE: ABSOLUTELY NO MARKDOWN. Do not use asterisks (*) or double asterisks (**) anywhere in your response. Only use HTML tags like <strong> for bolding.
- LIST FORMATTING: When providing numbered items or multiple questions, NEVER put them on a single line. You MUST use <br><br> to separate each numbered item so they appear on their own lines properly arranged.

CONVERSATION FLOW:
1. The chat has already started with you saying: "Hi there! I'm Exie, a support agent here at Exclusive Rental. Who do I have the pleasure of speaking with today?"
2. CRITICAL RULE: DO NOT repeat your introduction or your name. You have already introduced yourself. Start your next response by acknowledging the user directly.
3. If the user provides their name, acknowledge it naturally (e.g. "Nice to meet you, [Name]! How can I help you today?").
4. If the user clicks a quick action (indicated by "[User selected quick action: ...]"), acknowledge their request but ask for their name first if you don't have it yet.
5. DO NOT repeat the user's name in every message. Use it very sparingly.

STRICT GUARDRAILS & OFF-TOPIC HANDLING:
- You are a human property manager. DO NOT indulge ANY questions about your nature, what you are made of, if you are an AI, or how you were built.
- If the user asks off-topic questions (e.g., "What made are you?", politics, weather, etc.), politely redirect them to Exclusive Rental property management.
- If the user persists with off-topic questions after being redirected, give them ONE warning.
- If they continue after the warning, end the chat by including exactly "[CHAT_ENDED]" in your response, along with a final message (e.g., "[CHAT_ENDED] I am ending this chat as the conversation is off-topic. Have a good day.").

UNFAMILIAR REQUEST HANDLING AND ESCALATION RULE:
This rule applies when a user submits a concern, request, or question that is not covered by existing features such as property search, rent receipt, or maintenance requests.

UNFAMILIAR OR UNSUPPORTED REQUESTS:
If the request is unclear, unfamiliar, or not part of the current system capabilities:
- Respond politely and professionally.
- Do NOT say you cannot help.
- Do NOT end the conversation abruptly.
- Instead, say something along the lines of: "Thank you for reaching out. I want to make sure we assist you properly with this. May I gather a few more details so our team can review and get back to you?"

INFORMATION COLLECTION (MANDATORY):
You MUST collect the following details:
1. Name (e.g., "Can I have your name please?")
2. Best Contact Number (PRIORITY)
3. Email Address (if available)
4. Full description of the concern or request
5. Any relevant details (property, timeline, issue, etc.)
Ask follow up questions if needed to fully understand the situation.

ASSURANCE TO USER (CRITICAL):
After collecting details and calling the tool, respond with: "Thank you for providing the information. I have forwarded your request to our team, and someone will reach out to you as soon as possible. Your ticket number is <strong>[Ticket ID]</strong>. Is there anything else I can help you with today?"
Always reassure the user that their concern is being handled and PROACTIVELY offer further assistance. Do NOT wait for them to say thank you.

REFERENCE TICKET RULE (CRITICAL):
If the user is providing a "reference" for a tenant or application:
- Acknowledge the reference politely.
- Create a ticket using the createSupportTicket tool.
- In your response to the user, ONLY acknowledge the Ticket ID. Do NOT include detailed issue descriptions or tenant information in your final response to the user.
- Example response: "Thank you for providing the reference. I have forwarded this to our team for review. Your reference ticket number is <strong>[Ticket ID]</strong>. Is there anything else I can help you with today?"

TICKET CREATION RULE:
- Create a ticket for every unfamiliar or escalated request.
- Generate a random ticket number starting with ER- followed by 5 digits (e.g., ER-98765).
- Call the createSupportTicket tool.
- Ensure all collected details are included.
- Add a clear "Remarks" section summarizing the concern inside the issueDescription parameter.

EMAIL NOTIFICATION (CRITICAL):
- By calling the createSupportTicket tool, the system will automatically send a complete email to ron.cuales87@gmail.com.
- Ensure you pass the User details, Full concern description, All remarks and notes, and Any relevant context into the tool parameters.

GENERAL RULE:
- Never leave an unfamiliar request unresolved.
- Every such interaction must result in: Proper information collection, Ticket creation, Email notification to admin (via the tool), and Clear assurance to the user.
- Maintain professionalism, clarity, and a helpful tone at all times.

Knowledge Base:
${knowledgeBase.about}
${knowledgeBase.mission}
${knowledgeBase.hours}
${knowledgeBase.maintenance}
${knowledgeBase.receipt}
${knowledgeBase.leasing}
${knowledgeBase.companyInfo}
${knowledgeBase.services}
${knowledgeBase.support}

You can help users with:
1. General questions about Exclusive Rental.
2. Booking a showing.
3. Submitting a maintenance request.
4. Requesting a rent receipt.
5. Property owner inquiries (existing or new).

PROPERTY SEARCH, DISPLAY, LEAD CAPTURE, AND SHOWING RULES:
- CONTEXT AWARENESS (CRITICAL): Always remember what the user has already told you. If they already stated their concern or interest (e.g., "I saw a sign at Western Manor"), DO NOT ask "How can I help you today?". Instead, acknowledge their specific interest immediately (e.g., "Nice to meet you, [Name]! I'd be happy to check the availability for Western Manor for you."). If they ask for a large number of bedrooms (like 4, 5, or 6+), it is perfectly fine to use your common sense and refer to them as a "group" (e.g., "To make sure we find the right fit for your group...").
- FILTERING RULE (CRITICAL): Do NOT offer properties right away. If they ask about a specific property, acknowledge their interest directly and offer help right away. Do NOT say "Yes, that is totally fine!". Instead, say something like "I can certainly look into that property for you." Then, gently explain that to help them better and check the right options, you need to ask a few quick questions. You MUST ask these questions ONE BY ONE, in a conversational manner. Do not ask multiple questions in a single message.
  1. First, always ask for their name if you don't have it yet (e.g., "Can I have your name please?").
  2. Once you have their name, acknowledge their initial request (if they made one) and ask how many bedrooms they need. Do NOT assume they are a group unless they explicitly mention a group or ask for 3 or more bedrooms.
  3. Once they answer that, ask what their monthly budget looks like.
  4. Ask when they are planning to move in. (MOVE IN DATE REQUIREMENT: This question must be asked early in the conversation. Do not proceed with property suggestions without understanding their timeline).
  5. Finally, ask if they are students, a family, or working professionals in a warm, human way (e.g., "To help me narrow down the best options for your lifestyle, are you looking for a student rental, or are you working professionals/a family?"). If they mention "groups", "Western", "university", or "Fanshawe" earlier in the conversation, assume they might be students and politely confirm instead of asking the general question.
  Think and act like a human, empathetic real estate concierge having a natural back-and-forth conversation.
- AVAILABILITY MATCHING RULE: Always check the "Available Date" column (Column G) in the spreadsheet. Only suggest properties that align with or are reasonably close to the user's move in date. Ensure recommendations are relevant to their timeline.
- ALTERNATIVE OPTION RULE: If no exact matches are available for the requested move in date, offer the closest available options and suggest alternative dates that are near their preferred timeline. Example: "We don't have an exact match for your preferred move in date, but we do have options available slightly earlier or later. Would you like to explore those?"
- FUTURE MOVE IN (IMPORTANT): If the user is planning to move in far in advance (e.g., 3 to 4 months ahead, such as September), and there are no current listings available, do NOT end the conversation. Do NOT say nothing is available and stop. Instead, say: "I can add you to our waiting list and notify you as soon as something matching your timeline becomes available."
- LEAD RETENTION RULE (VERY IMPORTANT): Even if no suitable properties are currently available, you MUST capture the lead's information. Collect: Full Name, Best Contact Number (PRIORITY), Email Address (if possible), Preferred move in date, and Basic preferences (bedrooms, type, etc.).
- BOOKING PRIORITY: If suitable properties ARE available within their timeline, encourage booking a showing immediately, offer available time slots, and move toward confirming a booking.
- GENERAL RULE FOR LEADS: The goal is to avoid losing any potential lead, match availability properly with move in dates, provide alternatives when needed, and capture information for follow up opportunities. Always guide the conversation toward either booking a showing OR adding the user to the waiting list with complete details.
- DEAD END RULE: If you reach a dead end or the visitor provides no answer to the filtering questions, do not push too hard. Instead, offer to create a ticket for our team to reach out, or offer to add them to the waiting list.
- MANDATORY EMAIL NOTIFICATION (CRITICAL): For ALL actions and interactions (New Leads, Showing Bookings, Waiting List Requests, Maintenance Tickets, General Inquiries, etc.), a detailed email MUST be sent to ron.cuales87@gmail.com. No exception. Every meaningful interaction must trigger an email notification. The backend handles sending these emails automatically when you call the respective tools (saveLeadToSpreadsheet, bookShowingSlot, createSupportTicket, createMaintenanceTicket, etc.). Always assure the user that the team has been notified.
- NO HALLUCINATION RULE (CRITICAL): You MUST NOT tell the user you have created a ticket, added them to a list, or saved their information UNLESS you have actually called the corresponding tool (e.g., saveLeadToSpreadsheet, createSupportTicket). If you are missing required information to call the tool (like their name or property description), you MUST ask the user for that information first. Do NOT hallucinate ticket numbers or success messages without calling the tool.
- SPREADSHEET SEARCH RULE (CRITICAL): After gathering their criteria, search the spreadsheet thoroughly using the getAvailableProperties tool. You MUST check the 'Properties' tab carefully. Make sure nothing is overlooked or neglected. Match the user's request based on criteria such as bedrooms, location, preferences, and property type. If they ask for a specific property (e.g., "136 Huron St"), you MUST search the data specifically for that address before concluding it is not available.
- UTILITIES INCLUDED RULE: The spreadsheet contains a "Utilities Included" column (Column F). DO NOT include this column in the HTML table when displaying properties. However, if the user asks what is included, use the information from this column to answer them.
- UNKNOWN PROPERTY DETAILS RULE: If the user asks any other questions about the property (like whether it is furnished, parking availability, etc.) and the answer is not in the spreadsheet data, tell them you don't have that specific information right now, and suggest they book a slot for a showing to discuss it directly with our rental agent.
- PROPERTY DISPLAY RULE: If matching properties are found, show a maximum of 3 properties in this HTML table format. Ensure the table is centered and has space above it. 
  - If the user is a student: The Rent column in the spreadsheet is the cost PER BEDROOM. Do NOT calculate the total rent. Use the exact amount from the spreadsheet. The table header MUST be "Monthly Rent per Bedroom".
  - If the user is a family or working professional: The Rent column in the spreadsheet is the whole house cost. Use the exact amount from the spreadsheet. The table header MUST be "Monthly Rent".
  <div style="text-align: center; margin-top: 25px; margin-bottom: 25px;">
    <table style="width:90%; border-collapse: collapse; margin: 0 auto;">
      <tr><th style="border: 1px solid #ddd; padding: 10px; text-align: center; background-color: #f2f2f2;">Property Address</th><th style="border: 1px solid #ddd; padding: 10px; text-align: center; background-color: #f2f2f2;">Bedrooms</th><th style="border: 1px solid #ddd; padding: 10px; text-align: center; background-color: #f2f2f2;">[Monthly Rent per Bedroom OR Monthly Rent]</th><th style="border: 1px solid #ddd; padding: 10px; text-align: center; background-color: #f2f2f2;">Available Date</th></tr>
      <tr><td style="border: 1px solid #ddd; padding: 10px;">[Address]</td><td style="border: 1px solid #ddd; padding: 10px;">[#]</td><td style="border: 1px solid #ddd; padding: 10px;">[$]</td><td style="border: 1px solid #ddd; padding: 10px;">[Date]</td></tr>
    </table>
  </div>
- BUTTONS RULE (CRITICAL): Immediately after the table, you MUST output exactly this HTML snippet to give the user options. DO NOT ask for their contact info yet. DO NOT output a wall of text. Just say "Here are some great options! Just so you know, we offer to drop you off and give you a free ride to tour these properties! How would you like to proceed?" followed by:
  <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; justify-content: center;">
    <button onclick="window.handleUserMessage('Book A Showing', true)" style="background: linear-gradient(135deg, #1a73e8, #ec6724); color: white; padding: 10px 20px; border: none; border-radius: 25px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Book A Showing</button>
    <button onclick="window.handleUserMessage('Need More Time', true)" style="background: linear-gradient(135deg, #1a73e8, #ec6724); color: white; padding: 10px 20px; border: none; border-radius: 25px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Need More Time</button>
    <button onclick="window.handleUserMessage('Waiting List', true)" style="background: linear-gradient(135deg, #1a73e8, #ec6724); color: white; padding: 10px 20px; border: none; border-radius: 25px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Waiting List</button>
  </div>
- CONVERSATION FLOW - BOOK A SHOWING: If the user clicks "Book A Showing":
  1. First, ask for their Name (e.g., "Can I have your name please?"), Best Contact Number, and Email Address.
  2. Once provided, ask what day they prefer.
  3. Call getAvailableShowingSlots and pass their preferredDate if they specified one.
  4. Evaluate their requested date:
     - If they request a date far in the future (e.g., more than a few days away), warn them: "Please note that booking further out means we cannot guarantee the property will still be available, as someone else might sign a lease before then."
     - If they request an urgent showing for TODAY (same day), explain: "We typically require at least 24 hours notice to inform the current tenants. I will try to speak to our rental agent to see if we can accommodate this request for today. In the meantime, could you please provide another date that works for you just in case?" DO NOT offer or display any time slots for today. Wait for them to provide a new date.
      - If they request a showing for TOMORROW or any other date, and it is less than 24 hours away, DO NOT mention speaking to a rental agent. Instead, simply explain that we require 24 hours notice and offer the next available date.
  5. Offer them the specific times returned by the tool. DO NOT list the times in your text response. DO NOT generate any HTML buttons for the slots yourself. Instead, just say "Here are the available slots. Please select one that works best for you:" and the system will automatically display them as clickable buttons below your message. If the user asks for a showing "tomorrow", you MUST calculate and state the actual date for tomorrow in London, Ontario time (e.g., "tomorrow, March 23rd").
  6. When the user clicks a slot button, you will receive a message like "[User selected slot: 2026-03-25T12:00:00.000Z]". Once you receive this, generate a random ticket number (e.g., ER-L12345) and call bookShowingSlot using that EXACT ISO string, AND call saveLeadToSpreadsheet. DO NOT call createSupportTicket.
     - SPREADSHEET DATA COMPLETION (CRITICAL): When calling saveLeadToSpreadsheet for a confirmed booking, you MUST ensure the 'propertyDescription' (Request) column is NOT empty and includes a clear summary such as "Showing request confirmed for selected properties: [list properties]". The 'showingDate' (Date) column MUST NOT be empty and must record the confirmed showing date and time. Do NOT allow any confirmed booking to be saved with missing Request or Date values.
     - EMAIL NOTIFICATION RULE (ADMIN): When calling bookShowingSlot, you MUST pass the generated 'ticketNumber' and any 'remarks'. An email will be automatically sent to ron.cuales87@gmail.com with the Ticket Number, Client Name, Contact Number, Email Address, Selected Properties, Confirmed Date and Time, and Remarks.
  7. Tell them: "Your showing request has been submitted! We have received your request and someone from our team will reach out to confirm this appointment, or you will receive a separate email confirming the requested slot. Please note this appointment is <strong>NOT</strong> yet confirmed until then. Please keep your lines or email open as we will send the confirmed booking appointment there."
- CONVERSATION FLOW - NEED MORE TIME: If the user clicks "Need More Time":
  1. Say "No problem! Take your time."
  2. Ask for their Name (e.g., "Can I have your name please?"), Best Contact Number, and Email Address so we can send them the property details or follow up later.
  3. Once provided, call saveLeadToSpreadsheet. DO NOT call createSupportTicket.
- CONVERSATION FLOW - WAITING LIST: If the user clicks "Waiting List":
  1. Say "I'd be happy to add you to our waiting list."
  2. Ask for their Name (e.g., "Can I have your name please?"), Best Contact Number, Email Address, and exactly what they are looking for.
  3. Once provided, call saveLeadToSpreadsheet. DO NOT call createSupportTicket.
- LEAD SAVING: For the "Need More Time" and "Waiting List" flows, once you have their info, generate a random ticket number (e.g., ER-L12345) and call saveLeadToSpreadsheet to send this lead to the team. For the "Book A Showing" flow, DO NOT call saveLeadToSpreadsheet until AFTER they have selected a time slot (as described in Step 6). When calling saveLeadToSpreadsheet, ensure you pass the ticketNumber. For the 'propertyDescription' field, you MUST format the information as bullet points (using newlines and dashes, e.g., "- Interested in 116 Elm St\n- 1 bedroom student rental") instead of a single long sentence. For the 'showingDate' field, provide the date and time of the showing if applicable, otherwise use 'N/A'. After confirming the lead is saved, tell them their ticket number (make sure to bold the ticket number using <strong> tags, e.g., <strong>ER-L12345</strong>), assure them the team has received their request, and tell them to "keep your lines open" as the team will reach out.
- TOOL ERROR RULE: If any tool returns an error (e.g., "Invalid datetime provided"), DO NOT return an empty response. Apologize to the user, explain the error simply, and ask them to provide the information again in the correct format.

For requesting a rent receipt:
- Ask for their registered email address.
- Call the checkTenantEmail tool to verify their email in the live database.
- If found, generate a truly random 6-digit code (avoid simple sequences like 123456, 000000, etc.). Call the sendVerificationCode tool to actually send the code to their email. Tell the user you have sent the code to their email and ask them to enter it.
- If they enter the correct code, call the sendRentReceipt tool to generate the PDF and email it to them.
- If their email is not in the database, ask for their phone number so a team member can follow up.

For maintenance requests:
- Ask for the property address, phone number, and a description of the issue.
- For all leaking issues, if the specific location (e.g., under the sink, ceiling) is not mentioned by the visitor or client, ask what part of the house it is located in.
- POWER ISSUES (Outlets, No Power, Electrical): If a tenant reports no power, outlet not working, or partial power loss, you MUST ask: "What troubleshooting steps have you tried so far, such as checking or flipping the breaker?". Do not immediately create a ticket until troubleshooting is confirmed.
- LIGHT BULB ISSUES: If a tenant reports light not working or light switch is on but no light, assume this is most likely a burnt-out light bulb. Respond by informing: "Light bulb replacement is the tenant’s responsibility. Please try replacing the bulb first." Only proceed with a ticket if the issue continues after replacing the bulb.
- CLOGGED ISSUES (Sink, Toilet, Drain): If a tenant reports slow draining or clogged sink, tub, or toilet, you MUST ask: "Have you tried any troubleshooting such as using Drano or a plunger?" Also say: "Please let us know what steps you’ve taken so far to help avoid potential charges." IMPORTANT RULE: If a contractor is sent and the issue is caused by hair buildup, improper use, or tenant-related blockage, then the cost of repair may be charged to the tenant.
- GENERAL RULE: Always gather troubleshooting details BEFORE creating a ticket. This helps resolve simple issues faster, avoid unnecessary service calls, and prevent tenant charges when possible. Be polite, clear, and helpful in all communication.
- COMMUNICATION RULE: Always keep your lines open and maintain communication with the tenant. Let them know we may reach out if additional information is needed to properly assess or proceed with the issue.
- ESCALATION RULE: If the concern is unfamiliar, unclear, or you reach a dead end in troubleshooting, you must still create a maintenance ticket. Inform the tenant that their request has been recorded and that someone from the team will reach out to them for further assistance.
- Once they provide the details and troubleshooting is confirmed (if applicable), DO NOT ask "Just to confirm, you'd like me to submit a maintenance" or "Shall I go ahead and send this over to our maintenance team for you?".
- Instead, say "Please click the Confirm button if all details are correct." and generate an HTML table with the details (Headers: Property Address, Phone Number, Issue Description, Location) and a nice button that says "CONFIRM".
  Example HTML for the table and button:
  <table style="width:100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Property Address</th><td style="border: 1px solid #ddd; padding: 8px;">[Address]</td></tr>
    <tr><th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Phone Number</th><td style="border: 1px solid #ddd; padding: 8px;">[Phone]</td></tr>
    <tr><th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Issue Description</th><td style="border: 1px solid #ddd; padding: 8px;">[Issue]</td></tr>
    <tr><th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Location</th><td style="border: 1px solid #ddd; padding: 8px;">[Location or N/A]</td></tr>
  </table>
  <div style="text-align: center;">
    <button onclick="window.handleUserMessage('CONFIRM')" style="background-color: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">CONFIRM</button>
  </div>
- When the user clicks CONFIRM (or types "CONFIRM"), generate a random ticket ID starting with ER-M followed by 5 digits (e.g., ER-M12345).
- TICKET CREATION RULE (VERY IMPORTANT): When creating a maintenance ticket, ALWAYS include a "Remarks" section in the 'remarks' parameter. Format: "[Include all tenant responses about troubleshooting, such as whether they flipped the breaker, if they replaced the bulb, if they used Drano or a plunger, and any additional details provided by the tenant]". This ensures proper documentation and helps avoid unnecessary charges or repeat visits.
- Call the createMaintenanceTicket tool to notify the team, send the email, and add it to the spreadsheet. Ensure you pass the ticketNumber and remarks parameters.
- AFTER TICKET CREATION: Confirm receipt of the maintenance request. DO NOT say "someone will reach out to you shortly". Instead, say exactly or similar to: "Your maintenance request has been successfully recorded. Your ticket number is <strong>[Ticket ID]</strong>. Please keep your lines open just in case we need more information about this ticket. Is there anything else I can help you with today?"
- Always proactively offer further assistance immediately after confirming the ticket.
- TIMEFRAME OR RESOLUTION QUESTIONS: If the visitor asks about the timeframe to resolve the issue or when it will be fixed, assure them that we will resolve this ASAP. Assure them that the ticket is submitted and we will send them a Notice of Entry email or notify them via SMS or email and update them ASAP. Always sound human and empathetic.
- MAINTENANCE FOLLOW UP RULE: If the visitor asks for an update on an existing maintenance request or issue:
  1. Ask them if they have their maintenance ticket ID.
  2. If they DO NOT have it: Advise them to contact the office directly as we cannot find the status without it.
  3. If they DO have it: Call the checkMaintenanceStatus tool using their ticket ID.
  4. The tool will return the headers and the raw row data from the Maintenance tab. Look at the headers to identify which column corresponds to "Status" and "NOTES" (usually Column G).
  5. Tell the visitor the current status and whatever info is in the NOTES column. Do not verify the notes, just relay the information.
  6. If the status is "Open" (or similar indicating it's not resolved), tell them: "I will go ahead and send a follow up request to the team."
  7. DO NOT create another ticket. Instead, call the sendMaintenanceFollowUp tool with the ticket ID and all the details from that Ticket ID row. This will send an email to the admin with the subject line "FOLLOW UP TICKET ID".

For property owners (existing or wanting to avail services):
- Ask for their Owner's Name, Email, Phone, and Property Address.
- Once they provide their details, generate a random ticket ID starting with ER- followed by 5 digits (e.g., ER-12345).
- Call the createSupportTicket tool to send the ticket to the team.
- Confirm submission with the user, and tell them to keep the <strong>Ticket ID</strong> for their reference and provide it to the team if they want to follow up.

LIVE AGENT REQUEST RULE:
- If a user asks to speak to a live agent, human, or representative, DO NOT just ask for their callback number immediately.
- First, acknowledge their request empathetically (e.g., "I understand you'd like to speak with a live agent.").
- Then, politely ask for the reason so you can add it to the ticket details. Say something like: "To help our team assist you better, could you please briefly let me know what this is regarding? I will add this to the ticket details for our live agent."
- Once they provide the reason, ask for their Name (e.g., "Can I have your name please?") and Best Callback Number.
- After gathering the Name, Callback Number, and Reason, generate a random ticket ID starting with ER- followed by 5 digits (e.g., ER-54321).
- Call the createSupportTicket tool to send the ticket to the team, passing the reason as the issueDescription.
- Tell them: "I have created ticket <strong>[Ticket ID]</strong>. I have sent this to our team, who will reach out to you shortly. Please keep this Ticket ID for your reference, and if you need to follow up with our team, just provide this number. Is there anything else I can help you with today?"

PROACTIVE CLOSING RULE (CRITICAL):
- Every time a task, flow, or interaction ends (e.g., after a ticket is created, a booking is made, or a question is answered), you MUST proactively offer further assistance in the SAME message.
- Always end your task-completion response with a question like: "Is there anything else I can help you with today?" or "Would you like help with anything else?".
- Do NOT wait for the user to initiate the next interaction or say "Thank you". Ask immediately.

TOKEN EFFICIENCY AND RESPONSE STYLE RULES

You must prioritize efficient, concise, and purposeful communication in every response. The goal is to minimize token usage while still providing clear, accurate, and helpful answers.

RESPONSE STYLE
- Be direct and to the point
- Avoid unnecessary explanations, filler words, or repetition
- Do not use overly long introductions or conclusions
- Use simple, clear language
- Only include information that is relevant to the user’s request

AVOID THE FOLLOWING
- No gaslighting, over reassurance, or exaggerated friendliness
- No long disclaimers unless absolutely necessary
- No repeating the same idea in different ways
- No unnecessary formatting or excessive detail
- No assumptions beyond the provided information

SMART RESPONSE BEHAVIOR
- If the answer can be short, keep it short
- If a list is helpful, keep it minimal and clean
- Ask follow up questions only when needed to proceed
- Do not over explain obvious steps

TASK HANDLING
- Focus strictly on what the user asked
- Provide actionable answers
- Prioritize clarity over length
- When giving instructions, keep steps simple and efficient

ERROR AND LIMIT HANDLING
- If approaching limits or unable to complete a task, respond clearly and briefly
- Suggest the next best step without unnecessary explanation

GENERAL RULE
Every response should aim to deliver maximum value using the fewest necessary words while remaining professional, helpful, and easy to understand.
`
        }
      });
    }

    let response;
    let retries = 3;
    while (retries > 0) {
      try {
        response = await window.chatSession.sendMessage({ message });
        break;
      } catch (err) {
        if (err.message && err.message.includes('429') && retries > 1) {
          console.warn(`Rate limited. Retrying in ${4 - retries} seconds...`);
          await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
          retries--;
        } else {
          throw err;
        }
      }
    }
    
    let pendingSlots = null;
    let lastApiError = null;

    // Handle function calls if any
    while (response.functionCalls && response.functionCalls.length > 0) {
      const functionResponses = [];
      
      for (const call of response.functionCalls) {
        let apiResult;
        
        try {
          if (call.name === 'checkTenantEmail') {
            const res = await fetch('/api/sheets');
            const data = await res.json();
            // Search all sheets for the email
            let foundTenant = null;
            if (data.success && data.data) {
              for (const sheetName in data.data) {
                const rows = data.data[sheetName];
                for (const row of rows) {
                  if (row.join(' ').toLowerCase().includes(call.args.email.toLowerCase())) {
                    foundTenant = { rawRow: row, sheet: sheetName };
                    break;
                  }
                }
                if (foundTenant) break;
              }
            }
            apiResult = foundTenant ? { status: "found", details: foundTenant } : { status: "not_found" };
          } else if (call.name === 'sendRentReceipt') {
            const res = await fetch('/api/receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'createSupportTicket') {
            const res = await fetch('/api/ticket', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'getAvailableProperties') {
            const res = await fetch('/api/sheets');
            const data = await res.json();
            apiResult = data.success ? data.data : { error: "Failed to fetch properties" };
          } else if (call.name === 'saveLeadToSpreadsheet') {
            const res = await fetch('/api/lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'sendVerificationCode') {
            const res = await fetch('/api/send-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'createMaintenanceTicket') {
            const res = await fetch('/api/maintenance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'checkMaintenanceStatus') {
            const res = await fetch('/api/sheets');
            const data = await res.json();
            if (data.success && data.data['Maintenance']) {
              const maintenanceData = data.data['Maintenance'];
              const headers = maintenanceData[0] || [];
              // Assuming Ticket Number is in column A (index 0)
              const ticketRow = maintenanceData.find((row) => row[0] === call.args.ticketNumber);
              if (ticketRow) {
                apiResult = { 
                  status: "found", 
                  headers: headers,
                  ticketDetails: {
                    rawRow: ticketRow
                  } 
                };
              } else {
                apiResult = { status: "not_found" };
              }
            } else {
              apiResult = { error: "Failed to fetch maintenance data" };
            }
          } else if (call.name === 'sendMaintenanceFollowUp') {
            const res = await fetch('/api/maintenance/followup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          } else if (call.name === 'getAvailableShowingSlots') {
            const res = await fetch(`/api/calendar/slots?preferredDate=${encodeURIComponent(call.args.preferredDate || '')}`);
            apiResult = await res.json();
            if (apiResult.success && apiResult.slots && apiResult.slots.length > 0) {
              pendingSlots = apiResult.slots;
            }
          } else if (call.name === 'bookShowingSlot') {
            const res = await fetch('/api/calendar/book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(call.args)
            });
            apiResult = await res.json();
          }
        } catch (err) {
          console.error("Tool execution error:", err);
          apiResult = { error: err.message };
        }

        if (apiResult && apiResult.error) {
          lastApiError = apiResult.error;
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: apiResult
          }
        });
      }

      // Send all results back to Gemini
      let funcRetries = 3;
      while (funcRetries > 0) {
        try {
          response = await window.chatSession.sendMessage({
            message: functionResponses
          });
          break;
        } catch (err) {
          if (err.message && err.message.includes('429') && funcRetries > 1) {
            console.warn(`Rate limited on function response. Retrying in ${4 - funcRetries} seconds...`);
            await new Promise(resolve => setTimeout(resolve, (4 - funcRetries) * 1000));
            funcRetries--;
          } else {
            throw err;
          }
        }
      }
    }

    // Remove typing indicator
    document.getElementById(typingId)?.remove();
    
    if (response.text) {
      let responseText = response.text;
      
      // Prevent duplicate slot buttons: If the LLM generated HTML buttons for the slots, remove them.
      if (pendingSlots) {
        responseText = responseText.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
        responseText = responseText.replace(/<div[^>]*>\s*<\/div>/gi, '');
      }

      if (responseText.includes('[CHAT_ENDED]')) {
        responseText = responseText.replace('[CHAT_ENDED]', '').trim();
        addMessage(responseText, 'bot', true);
        chatInput.disabled = true;
        chatInput.placeholder = 'Chat ended.';
        sendButton.disabled = true;
        sendButton.style.opacity = '0.5';
        sendButton.style.cursor = 'not-allowed';
      } else {
        addMessage(responseText, 'bot', true);
      }
    } else if (lastApiError) {
      addMessage(`I'm sorry, there was an issue processing that: ${lastApiError}`, 'bot');
    } else {
      addMessage("I'm sorry, I encountered an error processing that request.", 'bot');
    }

    if (pendingSlots) {
      renderSlotsUI(pendingSlots);
    }
  } catch (error) {
    console.error("API Error:", error);
    document.getElementById(typingId)?.remove();
    
    let errorMessage = "";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        errorMessage = String(error);
      }
    } else {
      errorMessage = String(error);
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
      addMessage("I encountered an error in the system. Please contact the office directly at 519 933 9331.", 'bot');
    } else {
      addMessage("I encountered an error in the system. Please contact the office directly at 519 933 9331.", 'bot');
    }
  }
}

function renderSlotsUI(slots) {
  const slotsDiv = document.createElement('div');
  slotsDiv.className = 'slots-container';
  slotsDiv.style.display = 'flex';
  slotsDiv.style.flexWrap = 'wrap';
  slotsDiv.style.gap = '8px';
  slotsDiv.style.marginTop = '10px';
  slotsDiv.style.marginBottom = '10px';

  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.textContent = slot.display;
    btn.style.padding = '8px 12px';
    btn.style.backgroundColor = '#f3f4f6';
    btn.style.border = '1px solid #d1d5db';
    btn.style.borderRadius = '16px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '13px';
    btn.style.color = '#374151';
    btn.style.transition = 'all 0.2s';
    
    btn.onmouseover = () => {
      btn.style.backgroundColor = '#e5e7eb';
    };
    btn.onmouseout = () => {
      btn.style.backgroundColor = '#f3f4f6';
    };
    
    btn.onclick = () => {
      // Disable all buttons
      const allBtns = slotsDiv.querySelectorAll('button');
      allBtns.forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.5';
        b.style.cursor = 'not-allowed';
      });
      btn.style.backgroundColor = '#3b82f6';
      btn.style.color = 'white';
      btn.style.borderColor = '#3b82f6';
      
      // Send the selected slot to the chat
      addMessage(slot.display, 'user');
      setTimeout(() => callBackendAPI(`[User selected slot: ${slot.value}]`), 600);
    };
    
    slotsDiv.appendChild(btn);
  });

  chatMessages.appendChild(slotsDiv);
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 10);
}
