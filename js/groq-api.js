/**
 * groq-api.js - Groq AI API Wrapper
 * XTN 2026
 * Model: llama-3.3-70b-versatile
 */

// ============================================================
// CONFIG
// ============================================================
const GROQ_CONFIG = {
    API_KEY: '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',
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    MODEL: 'llama-3.3-70b-versatile',
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.7
};

// ============================================================
// MAIN FUNCTION: Call Groq API
// ============================================================
export async function callGroqAI(prompt, options = {}) {
    const {
        systemPrompt = 'Bạn là trợ lý AI hữu ích cho chiến dịch Xuân Tình Nguyện UEL 2026. Trả lời bằng tiếng Việt.',
        temperature = GROQ_CONFIG.TEMPERATURE,
        maxTokens = GROQ_CONFIG.MAX_TOKENS,
        json = false
    } = options;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    const requestBody = {
        model: GROQ_CONFIG.MODEL,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
    };

    if (json) {
        requestBody.response_format = { type: 'json_object' };
    }

    try {
        console.log('[Groq] Sending request...');

        const response = await fetch(GROQ_CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        console.log('[Groq] Response received:', content.substring(0, 100) + '...');

        return {
            success: true,
            content: content,
            usage: data.usage
        };

    } catch (error) {
        console.error('[Groq] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================
// HELPER: Parse JSON from AI response
// ============================================================
export function parseJSONFromAI(text) {
    try {
        // Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // Try to extract JSON from markdown code block
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e2) {
                console.error('[Groq] Failed to parse JSON from code block');
            }
        }

        // Try to find JSON object in text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (e3) {
                console.error('[Groq] Failed to parse JSON object');
            }
        }

        return null;
    }
}

// ============================================================
// EXPORT CONFIG (for debugging)
// ============================================================
export { GROQ_CONFIG };
