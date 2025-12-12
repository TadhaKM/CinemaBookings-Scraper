const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Redirect root to grading page
app.get('/', (req, res) => {
  res.redirect('/grading.html');
});

// Assignment grading endpoint
app.post('/api/grade', async (req, res) => {
  try {
    const { markingScheme, expectedAnswer, studentCode, expectedOutput } = req.body;

    // Validate required fields
    if (!markingScheme || !expectedAnswer || !studentCode) {
      return res.status(400).json({
        error: 'Missing required fields: markingScheme, expectedAnswer, and studentCode are required'
      });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.'
      });
    }

    // Build the grading prompt
    let prompt = `You are an expert code instructor tasked with grading a student's programming assignment. Please analyze the student's code carefully and provide detailed, constructive feedback.

## Marking Scheme:
${markingScheme}

## Expected Answer/Solution:
${expectedAnswer}

## Student's Code:
${studentCode}`;

    if (expectedOutput) {
      prompt += `

## Expected Output/Behavior:
${expectedOutput}`;
    }

    prompt += `

Please grade this assignment by:
1. Carefully comparing the student's code against the expected answer and marking scheme
2. Identifying what the student did correctly
3. Identifying any mistakes, bugs, or issues
4. Providing specific, constructive feedback on how to improve
5. Assigning a final grade based on the marking scheme

Format your response as follows:
- Start with a summary of the overall quality
- List what was done well
- List what needs improvement with specific examples
- Provide the final grade clearly (e.g., "Final Grade: 85/100" or "Grade: B+")

Be thorough, fair, and constructive in your evaluation.`;

    console.log('Sending grading request to Claude...');

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract the response text
    const feedback = message.content[0].text;

    // Extract the grade from the feedback
    const gradeMatch = feedback.match(/(?:Final\s+)?Grade:\s*([^\n]+)/i);
    const grade = gradeMatch ? gradeMatch[1].trim() : 'See feedback for details';

    console.log('Grading completed successfully');

    res.json({
      grade,
      feedback,
      success: true
    });

  } catch (error) {
    console.error('Error grading assignment:', error);

    // Handle API errors specifically
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your ANTHROPIC_API_KEY.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to grade assignment. Please try again.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Assignment Grading Tool',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║       🎓 Assignment Grading Tool Server 🎓            ║
║                                                        ║
║  Server running on: http://localhost:${PORT}           ║
║  Grading interface: http://localhost:${PORT}/grading.html
║                                                        ║
║  API Key Status: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Not configured'}                    ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`
⚠️  WARNING: ANTHROPIC_API_KEY is not set!

To use the grading tool:
1. Create a .env file in the project directory
2. Add your API key: ANTHROPIC_API_KEY=sk-ant-api03-...
3. Restart the server
    `);
  }
});
