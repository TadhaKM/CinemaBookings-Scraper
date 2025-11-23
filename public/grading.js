document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('gradingForm');
    const gradeButton = document.getElementById('gradeButton');
    const clearButton = document.getElementById('clearButton');
    const resultsDiv = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const errorDiv = document.getElementById('error');

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form values
        const markingScheme = document.getElementById('markingScheme').value.trim();
        const expectedAnswer = document.getElementById('expectedAnswer').value.trim();
        const studentCode = document.getElementById('studentCode').value.trim();
        const expectedOutput = document.getElementById('expectedOutput').value.trim();

        // Validate inputs
        if (!markingScheme || !expectedAnswer || !studentCode) {
            showError('Please fill in all required fields (Marking Scheme, Expected Answer, and Student Code).');
            return;
        }

        // Show loading state
        setLoadingState(true);
        hideError();
        hideResults();

        try {
            // Send grading request to backend
            const response = await fetch('/api/grade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    markingScheme,
                    expectedAnswer,
                    studentCode,
                    expectedOutput: expectedOutput || null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to grade assignment');
            }

            // Display results
            displayResults(data);
        } catch (error) {
            console.error('Grading error:', error);
            showError(error.message || 'An error occurred while grading the assignment. Please try again.');
        } finally {
            setLoadingState(false);
        }
    });

    // Handle clear button
    clearButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear the form?')) {
            form.reset();
            hideResults();
            hideError();
        }
    });

    function setLoadingState(loading) {
        gradeButton.disabled = loading;
        const btnText = gradeButton.querySelector('.btn-text');
        const btnLoading = gradeButton.querySelector('.btn-loading');

        if (loading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline-block';
        } else {
            btnText.style.display = 'inline-block';
            btnLoading.style.display = 'none';
        }
    }

    function displayResults(data) {
        // Convert markdown-style formatting to HTML
        let formattedFeedback = data.feedback
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Format numbered lists
        formattedFeedback = formattedFeedback.replace(/(\d+\.\s.*?)(?=<br>|$)/g, '<li>$1</li>');
        formattedFeedback = formattedFeedback.replace(/(<li>.*?<\/li>)/s, '<ol>$1</ol>');

        // Format bullet lists
        formattedFeedback = formattedFeedback.replace(/[-•]\s(.*?)(?=<br>|$)/g, '<li>$1</li>');
        formattedFeedback = formattedFeedback.replace(/(<li>.*?<\/li>)(?!<\/ol>)/s, '<ul>$1</ul>');

        // Get grade category for badge styling
        const gradeCategory = getGradeCategory(data.grade);

        resultsContent.innerHTML = `
            <div class="grade-display">
                <h3>Final Grade</h3>
                <div class="grade-badge grade-${gradeCategory}">
                    ${data.grade}
                </div>
            </div>

            <div class="feedback-content">
                <h3>Detailed Feedback</h3>
                ${formattedFeedback}
            </div>
        `;

        resultsDiv.style.display = 'block';

        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getGradeCategory(grade) {
        // Extract numeric grade if present
        const match = grade.match(/(\d+)/);
        if (match) {
            const numericGrade = parseInt(match[1]);
            if (numericGrade >= 90) return 'excellent';
            if (numericGrade >= 75) return 'good';
            if (numericGrade >= 60) return 'average';
            return 'poor';
        }

        // Grade by letter or keywords
        const lowerGrade = grade.toLowerCase();
        if (lowerGrade.includes('a') || lowerGrade.includes('excellent')) return 'excellent';
        if (lowerGrade.includes('b') || lowerGrade.includes('good')) return 'good';
        if (lowerGrade.includes('c') || lowerGrade.includes('average')) return 'average';
        return 'poor';
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        errorDiv.style.display = 'none';
    }

    function hideResults() {
        resultsDiv.style.display = 'none';
    }
});
