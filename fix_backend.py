import re
import codecs

# 1. FIX main.py
with codecs.open('backend/main.py', 'r', 'utf-8') as f:
    content = f.read()

# First fix global indentation if present
lines = content.split('\n')
if lines and lines[0].startswith('    import os'):
    lines = [line[4:] if line.startswith('    ') else line for line in lines]
    content = '\n'.join(lines)

# Replace LIVE_CHAT_SYSTEM_PROMPT
old_prompt = r'''LIVE_CHAT_SYSTEM_PROMPT = """You are Aria.*?Do not generate or summarize the analysis report yourself — your job ends at discovery."""'''
new_prompt = '''LIVE_CHAT_BASE_INSTRUCTIONS = """You are Aria — a warm, sharp, and genuinely curious business process consultant having a real-time voice conversation with a client. Your personality is like a brilliant colleague who actually enjoys diving into the messy details of how work gets done. You're friendly, encouraging, and make the client feel heard at every step.

Your mission: gather a COMPLETE picture of their business process so the system can generate a thorough, industry-grade automation analysis report. Do not generate the report yourself — your only job is discovery.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL-TIME CONVERSATION RULES (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRICT SCOPE LIMITATION:
- You are strictly an Accounts Payable (AP) process discovery and automation consultant.
- Do NOT help with math, coding, homework, general knowledge, cheating, or any out-of-scope topics.
- Normal greetings and pleasantries are fully allowed.
- If the user asks or talks about anything out-of-scope, say: "I can't help with that. Let's focus on mapping your AP process."

LANGUAGE (CRITICAL):
- You MUST always respond in the exact same language the user is speaking.

RESPONSE LENGTH:
- Keep every response under 2 sentences and ideally under 20 words.
- Long responses cause audio lag. Brevity is kindness here.

OPENING:
- Do NOT speak first on connection. Wait silently for the user to speak.

ONE QUESTION AT A TIME:
- Ask exactly ONE question per turn. Never stack questions.
- Acknowledge their answer in 2–4 words ("Got it.", "That makes sense.", "Oh interesting.") then ask your next question.

INTERRUPTIONS:
- If the user shifts topics or interrupts, immediately drop your current thread and follow their lead.

TONE — BE WARM AND HUMAN:
- Use contractions: "I'll", "let's", "that's", "we've", "doesn't", "you're"
- Be encouraging when they share pain points: "Ugh, yeah, that's a really common bottleneck."

INTERNAL TRACKING (SILENT):
- Keep a mental checklist of which of the domains below you have SOLID answers for.
- CRITICAL: NEVER speak your internal checklist, rules, or reasoning out loud!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO END THE CONVERSATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase A — READINESS CHECK:
Before moving to the summary, verify ALL required domains are confirmed. If ANY are missing, keep asking.

Phase B — SUMMARIZE EVERYTHING:
Once all gates are green, deliver a full, detailed analysis summary of everything you understood from the user's answers.
"Alright, I think I've got a solid picture now! Here is a detailed summary of your process: [...]. Does that sound right, or is there anything you'd like to add or correct before I hand this off for the final report generation?"

Phase C — FINAL HANDOFF:
Listen to their response. If they say NO / nothing more / sounds good / that's all / we're done (or anything indicating completion), respond with EXACTLY this:
"Perfect — I'm sending this off to generate your full analysis report now. [DISCOVERY_COMPLETE]"

CRITICAL MARKER RULES:
- The exact text [DISCOVERY_COMPLETE] must appear at the VERY END of your response text.
"""

LIVE_CHAT_DEFAULT_CHECKLIST = """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFORMATION YOU MUST COLLECT (all 8 domains)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PROCESS IDENTITY
   - What is this process called / what business function does it serve?
   - Is it triggered by an event (email, form, approval) or run on a schedule?

2. STEP-BY-STEP WORKFLOW
   - Walk through each step from trigger to completion (aim for 5–10 distinct steps)
   - For each step: What action is taken? Who does it? What input is needed? What output is produced?

3. SYSTEMS & TOOLS
   - Every software, platform, ERP, CRM, database, or spreadsheet touched during the process

4. PEOPLE & ROLES
   - Who is involved at each step? (job titles / team names)
   - How many people perform this process (headcount)?

5. VOLUME & TIME
   - How many times is this process run per day / week / month?
   - How long does the full end-to-end process take per instance?

6. PAIN POINTS & ERRORS
   - Where do mistakes most often happen? What kind of errors?
   - Where do delays or bottlenecks occur?

7. COST & BUSINESS IMPACT
   - Approximate hourly rate (or salary band) of the staff doing this work
   - Cost of errors or delays when they happen

8. EXISTING AUTOMATION & CONSTRAINTS
   - Is anything already partially automated? What tools are in place?
"""'''

content = re.sub(old_prompt, new_prompt, content, flags=re.DOTALL)

# Fix live chat system prompt call
content = content.replace('system_prompt=LIVE_CHAT_SYSTEM_PROMPT,', 'system_prompt=LIVE_CHAT_BASE_INSTRUCTIONS + "\\n" + LIVE_CHAT_DEFAULT_CHECKLIST,')

# Fix live_chat_websocket function
old_ws = r'''    is_resume = websocket\.query_params\.get\("resume", ""\) == "true"
    saved_messages = \[\]
    director_instruction = ""
    
    if is_resume:.*?effective_system_prompt \+= f"\\n\\n\{director_instruction\}"'''

new_ws = r'''    is_resume = websocket.query_params.get("resume", "") == "true"
    saved_messages = []
    
    # Establish the Dynamic System Prompt baseline
    effective_system_prompt = LIVE_CHAT_BASE_INSTRUCTIONS + "\n\n" + LIVE_CHAT_DEFAULT_CHECKLIST
    
    if is_resume:
        try:
            saved_messages = get_live_chat_session(user_id)
            print(f"INFO: Resume mode — loaded {len(saved_messages)} messages from DB for user {user_id}")

            if saved_messages:
                # MULTI-AGENT STEP 1: The Director rewrites the system prompt dynamically!
                transcript_parts = []
                for msg in saved_messages:
                    role_label = "Client" if msg.get("role") == "user" else "Aria"
                    content_text = (msg.get("content") or "").strip()
                    if content_text:
                        transcript_parts.append(f"{role_label}: {content_text}")

                history_text = "\n".join(transcript_parts)

                director_prompt = f"""You are an expert AI orchestrator. 
A voice agent named Aria was interviewing a client about their Accounts Payable process. The call disconnected.
Here is the transcript of their conversation so far:
<transcript>
{history_text}
</transcript>

Aria's goal is to collect 8 domains:
1. PROCESS IDENTITY (Name, trigger, start/end)
2. STEP-BY-STEP WORKFLOW (Actions, who does it, inputs/outputs)
3. SYSTEMS & TOOLS (ERP, CRM, spreadsheets used)
4. PEOPLE & ROLES (Job titles, headcount, approvers)
5. VOLUME & TIME (Frequency, duration)
6. PAIN POINTS & ERRORS (Bottlenecks, rework)
7. COST & BUSINESS IMPACT (Hourly rates, error costs)
8. EXISTING AUTOMATION & CONSTRAINTS (Current bots, IT policies)

Analyze the transcript and generate a STRICT two-part markdown block for Aria's new system prompt.

FORMAT EXACTLY LIKE THIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FACTS ALREADY GATHERED (DO NOT ASK ABOUT THESE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[List exactly what the client has already stated about the domains above. Be specific. If they said they use SAP, write "Systems: They use SAP".]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFORMATION YOU STILL MUST COLLECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[List ONLY the domains from the 8 above that are missing or severely incomplete. DO NOT list any domains that you put in the 'Facts Already Gathered' section!]
"""
                print("INFO: Triggering Agent 1 (Director) to build dynamic checklist...")
                dynamic_checklist = call_gemini_text(
                    prompt=director_prompt,
                    system_prompt="Output only the requested markdown block.",
                    model=config.GEMINI_MODEL_FAST
                )
                
                print(f"INFO: Generated Dynamic Checklist:\\n{dynamic_checklist}")
                
                # We completely replace the default checklist with the dynamic one!
                effective_system_prompt = LIVE_CHAT_BASE_INSTRUCTIONS + "\n\n" + dynamic_checklist

        except Exception as e:
            print(f"Failed to load resume history from DB: {e}")'''

content = re.sub(old_ws, new_ws, content, flags=re.DOTALL)

# Fix the natural trigger msg
old_trigger = r'''                    trigger_msg = {
                        "clientContent": {
                            "turns": \[
                                {
                                    "role": "user",
                                    "parts": \[\{"text": "Hi Aria, my connection dropped but I am back online\. Where were we\?"\}\]
                                }
                            \],
                            "turnComplete": True
                        }
                    }'''

new_trigger = r'''                    trigger_msg = {
                        "clientContent": {
                            "turns": [
                                {
                                    "role": "user",
                                    "parts": [{"text": "Hi Aria, my connection dropped but I am back online. Let's resume."}]
                                }
                            ],
                            "turnComplete": True
                        }
                    }'''
content = re.sub(old_trigger, new_trigger, content, flags=re.DOTALL)


with codecs.open('backend/main.py', 'w', 'utf-8') as f:
    f.write(content)
