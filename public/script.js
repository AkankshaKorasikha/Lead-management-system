document.addEventListener('DOMContentLoaded', () => {
    const checkinForm = document.getElementById('checkinForm');
    const messageDiv = document.getElementById('message');

    const visitDateInput = document.getElementById('visitDate');
    visitDateInput.min = new Date().toISOString().split('T')[0];

    checkinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const checkinData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            accessMethod: document.getElementById('accessMethod').value,
            visitDate: document.getElementById('visitDate').value
        };

        try {
            const response = await fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkinData)
            });
            
            const result = await response.json();
            if (response.ok) {
                messageDiv.textContent = result.message;
                checkinForm.reset();
                setTimeout(() => {
                    window.location.href = `/lounge.html?visitorId=${result.visitorId}`;
                }, 1000);
            } else {
                messageDiv.textContent = 'Error checking in. Please try again.';
                messageDiv.style.color = 'red';
            }
        } catch (err) {
            messageDiv.textContent = 'Error: ' + err.message;
            messageDiv.style.color = 'red';
        }
    });
});