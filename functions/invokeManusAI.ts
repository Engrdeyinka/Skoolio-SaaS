import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { prompt, systemPrompt, responseFormat, file_urls } = await req.json();

        if (!prompt) {
            return Response.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const manusApiKey = Deno.env.get('MANUS_AI_API_KEY');
        
        if (!manusApiKey) {
            return Response.json({ error: 'Manus AI API key not configured' }, { status: 500 });
        }

        // Prepare the messages
        let messages = [
            {
                role: "system",
                content: systemPrompt || "You are a helpful AI assistant for educational purposes."
            }
        ];

        // Handle file URLs if provided
        if (file_urls) {
            const urls = Array.isArray(file_urls) ? file_urls : [file_urls];
            
            // Build content array with text and images
            const content = [
                { type: "text", text: prompt }
            ];
            
            // Add each file as an image URL
            for (const url of urls) {
                content.push({
                    type: "image_url",
                    image_url: { 
                        url: url,
                        detail: "high" // Request high detail for better text extraction
                    }
                });
            }
            
            messages.push({
                role: "user",
                content: content
            });
        } else {
            // Text-only message
            messages.push({
                role: "user",
                content: prompt
            });
        }

        // Prepare the request to Manus AI
        const manusPayload = {
            model: "gpt-4o-mini", // Using GPT-4o-mini which supports vision
            messages: messages,
            max_tokens: 4000, // Increase for longer responses
            temperature: 0.3 // Lower temperature for more accurate extraction
        };

        // Add response format if specified (for JSON responses)
        if (responseFormat === 'json') {
            manusPayload.response_format = { type: "json_object" };
        }

        console.log('Calling Manus AI with payload:', JSON.stringify(manusPayload, null, 2));

        // Make request to Manus AI API
        const response = await fetch('https://api.manus.im/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${manusApiKey}`
            },
            body: JSON.stringify(manusPayload)
        });

        const responseText = await response.text();
        console.log('Manus AI response status:', response.status);
        console.log('Manus AI response:', responseText);

        if (!response.ok) {
            console.error('Manus AI error response:', responseText);
            return Response.json({ 
                error: 'Failed to get response from Manus AI', 
                details: responseText,
                status: response.status,
                endpoint: 'https://api.manus.im/v1/chat/completions'
            }, { status: response.status });
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            return Response.json({ 
                error: 'Invalid JSON response from Manus AI',
                details: responseText
            }, { status: 500 });
        }

        const aiResponse = data.choices?.[0]?.message?.content;

        if (!aiResponse) {
            return Response.json({ 
                error: 'No response content from Manus AI',
                data: data
            }, { status: 500 });
        }

        // If JSON format was requested, parse the response
        if (responseFormat === 'json') {
            try {
                const parsedResponse = JSON.parse(aiResponse);
                return Response.json({ success: true, data: parsedResponse });
            } catch (e) {
                console.error('Failed to parse AI response as JSON:', aiResponse);
                return Response.json({ 
                    success: true, 
                    data: aiResponse,
                    warning: 'Response was not valid JSON',
                    parseError: e.message
                });
            }
        }

        return Response.json({ success: true, data: aiResponse });

    } catch (error) {
        console.error('Manus AI integration error:', error);
        return Response.json({ 
            error: 'Failed to process request', 
            details: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});