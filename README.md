# Shared Collect — a Razorpay Agent Studio agent for shared monthly costs

Small businesses that share fixed monthly costs (a machine EMI, rent, a salary) chase colleagues for their share every month.
Shared Collect turns a plain-language description into a split, bills everyone through Razorpay Invoices, and helps when someone asks for more time.
**AI reads and proposes. Rules compute every rupee. You approve.**

## Run the demo

1. Open the app with `?demo` at the end of the address (e.g. `https://gemini-finance-flow.lovable.app/?demo`).
2. Use **Fill example** on each setup step (or enter your own colleagues and costs).
3. Press **Next** in the black demo bar to move through the month. Use the dropdown to see a colleague's phone, and **AI log** to see every AI call.

## How the AI works

- Google Gemini runs on the server through Lovable AI — it reads the cost description, reads WhatsApp replies (including Hinglish) and drafts messages.
- Every amount comes from the rules engine in `src/lib/rules.ts` (tested in `src/lib/rules.test.ts`). The AI never calculates money.
- Any AI message whose ₹ amounts differ from the rules is rejected.
- If the AI is unavailable, built-in rules take over and the screen shows "AI · built-in rules".
