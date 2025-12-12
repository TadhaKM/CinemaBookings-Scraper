# Quick Start - Assignment Grading Tool

Get the grading tool running in 3 simple steps!

## Step 1: Get Your API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Click "API Keys" in the sidebar
4. Click "Create Key"
5. Copy your API key (starts with `sk-ant-api03-...`)

## Step 2: Configure Your API Key

### On Windows (PowerShell):

```powershell
# Navigate to project
cd C:\projects\claude

# Create .env file with Notepad
notepad .env
```

In Notepad, type (replace with your actual key):
```
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
PORT=3000
```

Save and close.

### On Mac/Linux:

```bash
# Navigate to project
cd /home/user/claude

# Create .env file
echo "ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE" > .env
echo "PORT=3000" >> .env
```

## Step 3: Start the Grading Server

```bash
npm run grading
```

**That's it!** Open your browser to:
```
http://localhost:3000
```

It will automatically redirect to the grading interface.

---

## Usage

1. **Marking Scheme**: Enter your grading criteria and point values
2. **Expected Answer**: Paste your model solution
3. **Student Code**: Paste the code to grade
4. **Expected Output** (Optional): Describe expected behavior
5. Click **"Grade Assignment"**
6. Get detailed feedback and a final grade!

---

## Different Servers Available

### Grading Server Only (Recommended for grading):
```bash
npm run grading
```
- Clean, focused on grading only
- Opens directly to grading interface
- No background processes

### Movie Tracker Server (Original):
```bash
npm start
```
- Includes movie tracking features
- Grading tool available at `/grading.html`
- Runs background cron jobs

### Development Mode (Auto-reload):
```bash
npm run grading:dev
```
- Same as grading server but restarts on file changes
- Useful for development

---

## Troubleshooting

### "ANTHROPIC_API_KEY is not configured"
- Make sure `.env` file exists in project root
- Check that your API key is correctly pasted
- Restart the server

### Server won't start
- Check if another process is using port 3000
- Try changing PORT in `.env` to 3001 or 8080

### Grading takes too long
- Normal grading takes 5-15 seconds
- For very large code, it may take longer
- Check your internet connection

---

## Cost Information

- Each grading costs approximately $0.02-$0.05
- 100 assignments ≈ $2-$5
- Set spending limits in Anthropic console

---

## Support

See `GRADING_TOOL.md` for detailed documentation and examples.
