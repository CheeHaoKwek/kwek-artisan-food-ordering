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

        // Fetch Colleagues
        try {
            const colRes = await fetch('/api/public/colleagues');
            const colData = await colRes.json();
            const guestSelect = document.getElementById('guestName');
            if (colData.colleagues) {
                colData.colleagues.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c.name;
                    option.textContent = c.name;
                    guestSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error('Failed to load colleagues', err);
        }

        // Auto-fill name if stored locally to lower friction
        const savedName = localStorage.getItem('guestName');
        if (savedName) document.getElementById('guestName').value = savedName;

    } catch (err) {
        console.error('Failed to load menu', err);
        alert('Failed to connect to server.');
    }

    // Submit order intercept for confirmation
    const form = document.getElementById('orderForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            document.getElementById('confirmName').textContent = document.getElementById('guestName').value;
            
            let addons = [];
            if (document.getElementById('addMeat').checked) addons.push('Meat');
            if (document.getElementById('addVege').checked) addons.push('Tofu/Egg/Vege');
            let addonStr = addons.length ? ` (+${addons.join(', ')})` : '';
            
            document.getElementById('confirmSet').textContent = document.getElementById('setName').value + addonStr;
            document.getElementById('confirmQty').textContent = document.getElementById('quantity').value;
            
            document.getElementById('confirmOverlay').style.display = 'flex';
        });
    }

    const closeConfirmBtn = document.getElementById('closeConfirmBtn');
    if (closeConfirmBtn) {
        closeConfirmBtn.addEventListener('click', () => {
            document.getElementById('confirmOverlay').style.display = 'none';
        });
    }

    const finalSubmitBtn = document.getElementById('finalSubmitBtn');
    if (finalSubmitBtn) {
        finalSubmitBtn.addEventListener('click', async () => {
            finalSubmitBtn.disabled = true;
            finalSubmitBtn.textContent = 'Submitting...';

            const payload = {
                menu_id: document.getElementById('menuId').value,
                guest_name: document.getElementById('guestName').value,
                set_name: document.getElementById('setName').value,
                quantity: document.getElementById('quantity').value,
                add_meat: document.getElementById('addMeat').checked,
                add_vege: document.getElementById('addVege').checked,
                remark: document.getElementById('remark').value
            };

            localStorage.setItem('guestName', payload.guest_name);

            try {
                const res = await fetch('/api/public/order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await res.json();
                
                if (res.ok) {
                    document.getElementById('confirmOverlay').style.display = 'none';
                    document.getElementById('successOverlay').style.display = 'flex';
                } else {
                    alert('Error: ' + (result.error || 'Failed to submit'));
                    finalSubmitBtn.disabled = false;
                    finalSubmitBtn.textContent = 'Confirm & Submit';
                }
            } catch (err) {
                alert('Network error while submitting.');
                finalSubmitBtn.disabled = false;
                finalSubmitBtn.textContent = 'Confirm & Submit';
            }
        });
    }
});
