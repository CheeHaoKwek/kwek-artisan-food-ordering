document.addEventListener('DOMContentLoaded', async () => {
    
    // Check Auth
    try {
        const res = await fetch('/api/admin/check');
        if (res.ok) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
            loadDashboardData();
        } else {
            document.getElementById('loginScreen').style.display = 'block';
        }
    } catch (e) {
        document.getElementById('loginScreen').style.display = 'block';
    }

    // Login Handle
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        btn.disabled = true;
        btn.textContent = 'Logging in...';

        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            })
        });

        if (res.ok) {
            window.location.reload();
        } else {
            alert('Invalid credentials');
            btn.disabled = false;
            btn.textContent = 'Login';
        }
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.reload();
    });

    let currentMenuId = null;

    async function loadDashboardData() {
        // Load Menu Data
        const menuRes = await fetch('/api/menu/active');
        const menu = await menuRes.json();
        
        const badge = document.getElementById('adminMenuStatus');
        const imgContainer = document.getElementById('adminMenuImageContainer');
        const img = document.getElementById('adminMenuImage');
        const openBtn = document.getElementById('openMenuBtn');
        const closeBtn = document.getElementById('closeMenuBtn');

        if (menu && menu.id) {
            currentMenuId = menu.id;
            badge.textContent = menu.status.toUpperCase();
            if (menu.status === 'closed') badge.classList.add('closed');
            else badge.classList.remove('closed');

            img.src = menu.image_url;
            imgContainer.style.display = 'block';

            if (menu.status === 'draft' || menu.status === 'closed') {
                openBtn.style.display = 'inline-block';
                closeBtn.style.display = 'none';
            } else if (menu.status === 'active') {
                openBtn.style.display = 'none';
                closeBtn.style.display = 'inline-block';
            }
        } else {
            badge.textContent = 'NO MENU';
            imgContainer.style.display = 'none';
            openBtn.style.display = 'none';
            closeBtn.style.display = 'none';
        }

        // Load Summary Data
        const sumRes = await fetch('/api/admin/summary');
        const summary = await sumRes.json();
        
        if (summary) {
            document.getElementById('statOrders').textContent = summary.totalOrders || 0;
            
            let setsHtml = '';
            if (summary.setGroups && Object.keys(summary.setGroups).length > 0) {
                for (const [setName, qty] of Object.entries(summary.setGroups)) {
                    setsHtml += `<div style="font-size:1.25rem; font-weight:600; color:var(--text-main);">${setName}: <span style="color:var(--primary); font-size:1.5rem;">${qty}</span></div>`;
                }
            }
            document.getElementById('statSets').innerHTML = setsHtml || '<span style="color:var(--text-muted)">0</span>';

            document.getElementById('statPrice').textContent = `RM${summary.totalPrice || '0.00'}`;
        }

        // Load Vendor Message
        const vmRes = await fetch('/api/admin/vendor-message');
        if (vmRes.ok) {
            const vendorMsg = await vmRes.json();
            document.getElementById('vendorMessageText').value = vendorMsg.message;
        } else {
            document.getElementById('vendorMessageText').value = "No active orders to generate message.";
        }

        // Load Orders Table
        loadOrdersTable();
        
        // Load Colleagues Table
        loadColleaguesTable();
    }

    async function loadOrdersTable() {
        const tbody = document.getElementById('ordersTableBody');
        const res = await fetch('/api/admin/orders');
        const data = await res.json();

        if (!data.orders || data.orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No orders yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.orders.map(o => {
            let addons = [];
            if (o.add_meat === 1) addons.push('Meat');
            if (o.add_vege === 1) addons.push('Tofu/Egg/Vege');
            const addonText = addons.length > 0 ? addons.join(', ') : '<span style="color:var(--text-muted)">-</span>';
            return `
            <tr>
                <td style="font-weight: 600;">${o.guest_name}</td>
                <td>${o.set_name}</td>
                <td>x${o.quantity}</td>
                <td>${addonText}</td>
                <td>${o.remark || '<span style="color:var(--text-muted)">-</span>'}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">
                    ${new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </td>
            </tr>
            `;
        }).join('');
    }

    async function loadColleaguesTable() {
        const tbody = document.getElementById('colleaguesTableBody');
        try {
            const res = await fetch('/api/admin/colleagues');
            if (!res.ok) throw new Error();
            const data = await res.json();

            if (!data.colleagues || data.colleagues.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">No colleagues found</td></tr>';
                return;
            }

            tbody.innerHTML = data.colleagues.map(c => `
                <tr>
                    <td style="font-weight: 600;">${c.name}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-danger btn-sm" onclick="deleteColleague(${c.id})">Delete</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Failed to load</td></tr>';
        }
    }

    // Expose delete to window so inline onclick works
    window.deleteColleague = async (id) => {
        if (!confirm('Are you sure you want to delete this colleague?')) return;
        try {
            const res = await fetch(`/api/admin/colleagues/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadColleaguesTable();
            } else {
                alert('Failed to delete colleague');
            }
        } catch (e) {
            alert('Error deleting colleague');
        }
    };

    // Add Colleague Modal Logic
    const addColleagueModal = document.getElementById('addColleagueModal');
    
    document.getElementById('openAddColleagueBtn')?.addEventListener('click', () => {
        addColleagueModal.style.display = 'flex';
        setTimeout(() => document.getElementById('newColleagueName').focus(), 100);
    });

    document.getElementById('closeAddColleagueBtn')?.addEventListener('click', () => {
        addColleagueModal.style.display = 'none';
    });

    document.getElementById('addColleagueForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('newColleagueName');
        const name = input.value.trim();
        if (!name) return;
        
        const btn = e.target.querySelector('button');
        btn.disabled = true;

        try {
            const res = await fetch('/api/admin/colleagues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (res.ok) {
                input.value = '';
                addColleagueModal.style.display = 'none';
                loadColleaguesTable();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to add colleague');
            }
        } catch (e) {
            alert('Error adding colleague');
        }
        btn.disabled = false;
    });

    document.getElementById('refreshOrdersBtn').addEventListener('click', loadDashboardData);

    // Upload Menu
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('menuImageFile');
        if (!fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('menu_image', fileInput.files[0]);

        const btn = document.getElementById('uploadBtn');
        btn.disabled = true;
        btn.textContent = 'Uploading...';

        const res = await fetch('/api/menu/upload', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            fileInput.value = '';
            loadDashboardData();
        } else {
            alert('Failed to upload image');
        }
        btn.disabled = false;
        btn.textContent = 'Upload & Draft';
    });

    // Menu Controls
    document.getElementById('openMenuBtn').addEventListener('click', async () => {
        if (!currentMenuId) return;
        await fetch(`/api/menu/open/${currentMenuId}`, { method: 'POST' });
        loadDashboardData();
    });

    document.getElementById('closeMenuBtn').addEventListener('click', async () => {
        if (!currentMenuId) return;
        await fetch(`/api/menu/close/${currentMenuId}`, { method: 'POST' });
        loadDashboardData();
    });

    // Copy Message
    document.getElementById('copyMessageBtn').addEventListener('click', () => {
        const text = document.getElementById('vendorMessageText');
        text.select();
        document.execCommand('copy');
        const btn = document.getElementById('copyMessageBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Message', 2000);
    });

    // Settings Modal
    const settingsModal = document.getElementById('settingsModal');
    
    document.getElementById('openSettingsBtn').addEventListener('click', async () => {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
            const s = await res.json();
            document.getElementById('setCompany').value = s.company_name;
            document.getElementById('setLevel').value = s.office_level;
            document.getElementById('setReminder').value = s.reminder_time;
            document.getElementById('setCutoff').value = s.cutoff_time;
            document.getElementById('setTimezone').value = s.timezone;
            document.getElementById('setWebhook').value = s.teams_webhook_url || '';
            
            // Format newlines for UI
            document.getElementById('setTemplate').value = s.vendor_message_template.replace(/\\n/g, '\n');
            
            settingsModal.style.display = 'flex';
        }
    });

    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveSettingsBtn');
        btn.disabled = true;

        const payload = {
            company_name: document.getElementById('setCompany').value,
            office_level: document.getElementById('setLevel').value,
            reminder_time: document.getElementById('setReminder').value,
            cutoff_time: document.getElementById('setCutoff').value,
            timezone: document.getElementById('setTimezone').value,
            teams_webhook_url: document.getElementById('setWebhook').value,
            // Convert literal newlines to '\\n' for database storage
            vendor_message_template: document.getElementById('setTemplate').value.replace(/\n/g, '\\n')
        };

        const res = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            settingsModal.style.display = 'none';
            loadDashboardData();
        } else {
            alert('Failed to save settings');
        }
        btn.disabled = false;
    });
});
