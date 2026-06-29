import re
import codecs

with codecs.open('frontend/src/components/LiveChat.jsx', 'r', 'utf-8') as f:
    content = f.read()

# Fix size="{...}"
content = re.sub(r'size="\{(\d+)\}"', r'size={\1}', content)

# Fix the silenceLockTimer timeout
old_timeout = r'''      // FIX BUG 1: Increased timeout to 12 seconds to prevent ambient noise 
      // from interrupting the AI while the backend is generating the memory context.
      silenceLockTimer = setTimeout\(\(\) => \{
        isInitialResumeSilentRef\.current = false;
        
        // Failsafe: if the mic is still locked after 12 seconds, force it open
        if \(isResume && !isListeningRef\.current && phaseRef\.current === 'connected'\) \{
            setIsListening\(true\);
            setStatusText\('Resumed! Listening\.\.\.'\);
        \}
      \}, 12000\);'''

new_timeout = r'''      // FIX: Lock the microphone completely during resume initialization.
      // We do NOT use setTimeout here anymore. The lock will be released
      // ONLY when the AI finishes speaking its memory confirmation (turnComplete).
      isInitialResumeSilentRef.current = true;'''
content = re.sub(old_timeout, new_timeout, content, flags=re.DOTALL)

# Fix turnComplete unlock logic
old_unlock = r'''            // FIX BUG 2: Auto-unlock mic reliably when AI finishes its first resume response!
            // We no longer rely on the brittle "restored" word check.
            if \(isResume && !isListeningRef\.current\) \{
                isInitialResumeSilentRef\.current = false;
                setIsListening\(true\);
                setStatusText\('Listening\.\.\.'\);
            \}'''

new_unlock = r'''            // FIX: Safely auto-unlock mic when AI finishes generating its resumed response
            if (isResume && !isListeningRef.current) {
                isInitialResumeSilentRef.current = false;
                setIsListening(true);
                setStatusText('Listening...');
            }'''
content = re.sub(old_unlock, new_unlock, content, flags=re.DOTALL)

with codecs.open('frontend/src/components/LiveChat.jsx', 'w', 'utf-8') as f:
    f.write(content)
