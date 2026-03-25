document.addEventListener('DOMContentLoaded', async () => {
    const loadingPanel = document.getElementById('loadingPanel');
    const mainPanel = document.getElementById('mainPanel');
    const menuContent = document.getElementById('menuContent');
    const closedContent = document.getElementById('closedContent');
    const noMenuContent = document.getElementById('noMenuContent');
    
    // Fetch menu
    try {
        const response = await fetch('/api/public/menu');
        const data = await response.json();
        
        loadingPanel.style.display = 'none';
        mainPanel.style.display = 'block';

        if (data.config) {
            document.getElementById('companyNameDisplay').textContent = `${data.config.company_name} Order`;
            document.getElementById('cutoffTimeDisplay').textContent = data.config.cutoff_time;
        }

        if (!data.menu) {
            menuContent.style.display = 'none';
            noMenuContent.style.display = 'block';
            document.getElementById('statusBadge').style.display = 'none';
            return;
        }

        if (data.menu.closed) {
            menuContent.style.display = 'none';
            closedContent.style.display = 'block';
            const badge = document.getElementById('statusBadge');
            badge.textContent = 'Closed';
            badge.classList.add('closed');
            return;
        }

        // Apply active menu
        document.getElementById('menuImage').src = data.menu.image_url;
        document.getElementById('menuId').value = data.menu.id;

        // Auto-fill name if stored locally to lower friction
        const savedName = localStorage.getItem('guestName');
        if (savedName) document.getElementById('guestName').value = savedName;

    } catch (err) {
        console.error('Failed to load menu', err);
        alert('Failed to connect to server.');
    }

    // Submit order
    const form = document.getElementById('orderForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            const payload = {
                menu_id: document.getElementById('menuId').value,
                guest_name: document.getElementById('guestName').value,
                set_name: document.getElementById('setName').value,
                quantity: document.getElementById('quantity').value,
                add_meat: document.getElementById('addMeat').checked,
                add_vege: document.getElementById('addVege').checked,
                remark: document.getElementById('remark').value
            };

            // Save name for next time
            localStorage.setItem('guestName', payload.guest_name);

            try {
                const res = await fetch('/api/public/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await res.json();
                
                if (res.ok) {
                    document.getElementById('successOverlay').style.display = 'flex';
                } else {
                    alert('Error: ' + (result.error || 'Failed to submit'));
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Order';
                }
            } catch (err) {
                alert('Network error while submitting.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Order';
            }
        });
    }
});
