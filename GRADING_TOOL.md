# Assignment Grading Tool

An AI-powered web application that uses Claude (Anthropic's AI) to automatically grade programming assignments and provide detailed, constructive feedback.

## Features

- **Automated Grading**: Submit student code and get comprehensive AI-powered evaluations
- **Customizable Rubrics**: Define your own marking schemes and criteria
- **Detailed Feedback**: Get specific, actionable feedback on what's right and what needs improvement
- **Expected Solutions**: Compare student code against model solutions
- **Output Validation**: Specify expected behavior and outputs for thorough evaluation
- **Clean Interface**: Simple, intuitive web interface for easy grading

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Your Anthropic API Key

1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```
ANTHROPIC_API_KEY=your_actual_api_key_here
PORT=3000
```

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 5. Access the Grading Tool

Open your browser and navigate to:

```
http://localhost:3000/grading.html
```

## How to Use

### Step 1: Define Your Marking Scheme

Enter your grading criteria, for example:

```
Total Points: 100

Functionality (40 points):
- Code runs without errors (20 pts)
- Meets all requirements (20 pts)

Code Quality (30 points):
- Clean, readable code (15 pts)
- Follows best practices (15 pts)

Documentation (20 points):
- Well-commented code (10 pts)
- Clear variable names (10 pts)

Testing (10 points):
- Includes test cases (10 pts)
```

### Step 2: Provide Expected Answer

Paste your model solution or describe what the correct implementation should include:

```javascript
function calculateAverage(numbers) {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}
```

### Step 3: Submit Student Code

Paste the student's code submission:

```javascript
function calculateAverage(numbers) {
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i];
  }
  return sum / numbers.length;
}
```

### Step 4: (Optional) Specify Expected Output

Describe how the code should behave:

```
- calculateAverage([1, 2, 3, 4, 5]) should return 3
- calculateAverage([]) should return 0
- Should handle edge cases like empty arrays
```

### Step 5: Get Results

Click "Grade Assignment" and receive:
- A final grade (e.g., "85/100" or "B+")
- What the student did well
- What needs improvement
- Specific, actionable feedback

## Example Use Cases

### Web Development Assignment

```
Marking Scheme:
- HTML structure (25 pts)
- CSS styling (25 pts)
- JavaScript functionality (30 pts)
- Responsive design (20 pts)

Expected Answer:
A contact form with email validation, error messages, and AJAX submission

Student Code:
[Student's HTML/CSS/JS code]

Expected Output:
- Form should validate email format
- Should show error messages for invalid inputs
- Should prevent default form submission
- Should display success message on submit
```

### Algorithm Assignment

```
Marking Scheme:
- Correct algorithm implementation (50 pts)
- Time complexity optimization (25 pts)
- Edge case handling (15 pts)
- Code clarity (10 pts)

Expected Answer:
Implement binary search with O(log n) complexity

Student Code:
[Student's implementation]

Expected Output:
- Should find elements in sorted array
- Should return -1 for missing elements
- Should handle empty arrays
```

## API Endpoint

The grading functionality is also available as a REST API:

**POST** `/api/grade`

Request body:
```json
{
  "markingScheme": "Your marking scheme here...",
  "expectedAnswer": "Expected solution code...",
  "studentCode": "Student's submitted code...",
  "expectedOutput": "Optional: Expected behavior..."
}
```

Response:
```json
{
  "grade": "85/100",
  "feedback": "Detailed feedback text...",
  "success": true
}
```

## Troubleshooting

### "ANTHROPIC_API_KEY is not configured"

Make sure you've created a `.env` file with your API key.

### API Key Invalid

Double-check that you've copied your API key correctly from the Anthropic console.

### Server Won't Start

- Check that port 3000 is not in use by another application
- Verify all dependencies are installed: `npm install`

### Grading Takes Too Long

- Claude API calls can take 5-15 seconds depending on code complexity
- For very long code submissions, consider breaking into smaller pieces

## Cost Considerations

This tool uses the Claude API which has associated costs:
- Each grading request uses ~1,000-3,000 tokens
- Check [Anthropic's pricing](https://www.anthropic.com/pricing) for current rates
- Monitor your usage in the Anthropic console

## Privacy & Security

- Student code is sent to Anthropic's API for grading
- Do not submit code containing sensitive information or secrets
- Review Anthropic's [data usage policies](https://www.anthropic.com/legal/privacy)

## Tips for Best Results

1. **Be Specific in Rubrics**: Clearly define point values and criteria
2. **Provide Complete Solutions**: More detailed expected answers = better grading
3. **Include Expected Behavior**: Describing outputs helps with functional assessment
4. **Review AI Feedback**: AI grading is a tool to assist, not replace instructor judgment
5. **Use for Preliminary Grading**: Great for initial assessment, final review by instructor recommended

## License

MIT
