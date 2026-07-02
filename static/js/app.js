document.addEventListener('DOMContentLoaded', () => {
    const productGrid = document.getElementById('product-grid');
    const cartDrawer = document.getElementById('cart-drawer');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const cartFab = document.getElementById('cart-fab');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalAmount = document.getElementById('cart-total-amount');
    const cartItemCount = document.getElementById('cart-item-count');
    const orderForm = document.getElementById('order-form');
    const paymentMethod = document.getElementById('payment-method');
    const orderNote = document.getElementById('order-note');
    const submitOrderBtn = document.getElementById('submit-order-btn');
    const successNotification = document.getElementById('success-notification');
    const customerSearch = document.getElementById('customer-search');
    const customerList = document.getElementById('customer-list');
    const selectedCustomerText = document.getElementById('selected-customer-text');
    const customerSummary = document.getElementById('customer-summary');
    const dayStatusText = document.getElementById('day-status-text');
    const editModal = document.getElementById('edit-customer-order-modal');
    const closeEditModal = document.getElementById('close-edit-modal');
    const editModalTitle = document.getElementById('edit-modal-title');
    const editOrderCustomerSelect = document.getElementById('edit-order-customer-select');
    const editOrderPaymentSelect = document.getElementById('edit-order-payment-select');
    const editOrderNoteInput = document.getElementById('edit-order-note-input');
    const editOrderProductList = document.getElementById('edit-order-product-list');
    const saveEditOrderBtn = document.getElementById('save-edit-order-btn');
    const extraFoodPanel = document.getElementById('extra-food-panel');
    const closeExtraPanel = document.getElementById('close-extra-panel');
    const extraFoodList = document.getElementById('extra-food-list');

    let cart = [];
    let customers = [];
    let selectedCustomer = null;
    let isDayClosed = false;
    let editingOrderId = null;
    let lastOrderId = null;
    let allProducts = [];
    let isNewOrder = false;

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value.replace(' ', 'T'))) : '';
    const statusText = (status) => status === 'paid' ? 'Đã trả hết' : status === 'partial' ? 'Đã trả một phần' : 'Chưa trả';

    const renderCustomerList = () => {
        const keyword = customerSearch.value.trim().toLowerCase();
        const visible = customers.filter((customer) => customer.name.toLowerCase().includes(keyword));
        customerList.innerHTML = visible.map((customer) => `
            <button class="customer-option ${customer.group_type === 'vjp' ? 'vjp' : ''} ${selectedCustomer?.id === customer.id ? 'selected' : ''}" type="button" data-id="${customer.id}">
                <span>${customer.name}</span>
                ${customer.group_type === 'vjp' ? '<small>Khách VJP</small>' : ''}
            </button>
        `).join('');
    };

    const loadCustomers = async () => {
        const response = await fetch('/api/customers?active=1');
        customers = await response.json();
        renderCustomerList();
    };

    const loadDayStatus = async () => {
        const response = await fetch('/api/day-status');
        const data = await response.json();
        isDayClosed = Boolean(data.is_closed);
        dayStatusText.textContent = isDayClosed ? 'Hôm nay đã chốt đơn, chỉ xem lại đơn đã đặt.' : 'Hôm nay cố gắng rồi, ăn gì ngon nha! .';
        submitOrderBtn.disabled = isDayClosed;
        submitOrderBtn.textContent = isDayClosed ? 'Đã chốt đơn hôm nay' : 'Đặt hàng';
    };

    const loadProducts = async () => {
        try {
            const response = await fetch('/api/products?public=1');
            const products = await response.json();
            allProducts = products;
            productGrid.innerHTML = '';
            if (!products.length) {
                productGrid.innerHTML = '<p class="muted">Hôm nay chưa có món nào được mở bán.</p>';
                return;
            }

            products.forEach((product) => {
                const soldOut = Boolean(product.is_sold_out);
                const card = document.createElement('article');
                card.className = `product-card ${soldOut ? 'sold-out' : ''}`;
                card.innerHTML = `
                    <img src="${product.image_url || 'https://via.placeholder.com/600x400.png?text=Mon+An'}" alt="${product.name}">
                    <div class="product-info">
                        <h3>${product.name}</h3>
                        <p class="product-description">${(product.description || '').trim()}</p>
                        <p class="product-price">${formatCurrency(product.price)}</p>
                        <button class="btn ${soldOut ? 'btn-secondary' : 'btn-primary'} add-to-cart-btn"
                            data-id="${product.id}" data-name="${product.name}" data-price="${product.price}" type="button" ${soldOut ? 'disabled' : ''}>
                            ${soldOut ? 'Đã hết món' : 'Thêm vào giỏ'}
                        </button>
                    </div>
                `;
                productGrid.appendChild(card);
            });
        } catch (error) {
            console.error('Lỗi khi tải món:', error);
            productGrid.innerHTML = '<p>Không thể tải danh sách món. Vui lòng thử lại sau.</p>';
        }
    };

    const toggleCart = () => cartDrawer.classList.toggle('open');

    const updateCart = () => {
        cartItemsContainer.innerHTML = '';
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="cart-empty-msg">Giỏ hàng đang trống.</p>';
        } else {
            cart.forEach((item) => {
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                cartItem.innerHTML = `
                    <div class="cart-item-info">
                        <span>${item.name} x ${item.quantity}</span>
                        <span class="cart-item-price">${formatCurrency(item.price * item.quantity)}</span>
                    </div>
                    <button class="remove-item-btn" data-id="${item.id}" type="button">&times;</button>
                `;
                cartItemsContainer.appendChild(cartItem);
            });
        }
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartTotalAmount.textContent = formatCurrency(total);
        cartItemCount.textContent = totalItems;
        cartItemCount.style.display = totalItems > 0 ? 'flex' : 'none';
    };

    const addToCart = (id, name, price) => {
        const existingItem = cart.find((item) => item.id === id);
        if (existingItem) existingItem.quantity += 1;
        else cart.push({ id, name, price, quantity: 1 });
        updateCart();
    };

    const removeFromCart = (id) => {
        const item = cart.find((cartItem) => cartItem.id === id);
        if (!item) return;
        item.quantity -= 1;
        if (item.quantity <= 0) cart = cart.filter((cartItem) => cartItem.id !== id);
        updateCart();
    };

    const showNotification = () => {
        successNotification.classList.add('show');
        setTimeout(() => successNotification.classList.remove('show'), 3000);
    };

    const loadCustomerSummary = async () => {
        if (!selectedCustomer) return;
        customerSummary.innerHTML = '<p class="muted">Đang tải tổng kết...</p>';
        try {
            const response = await fetch(`/api/customer-summary/${selectedCustomer.id}`);
            const result = await response.json();
            if (!result.success) {
                customerSummary.innerHTML = `<p class="muted">${result.message || 'Không thể tải tổng kết.'}</p>`;
                return;
            }
            const summary = result.summary;
            const orders = result.orders || [];
            customerSummary.innerHTML = `
                <article class="summary-card ${result.customer.group_type === 'vjp' ? 'vjp' : ''}">
                    <strong>${result.customer.name}</strong>
                    <span>${result.customer.group_type === 'vjp' ? 'Khách VJP' : ''}</span>
                    <div class="summary-grid">
                        <div><small>Tổng mua</small><b>${formatCurrency(summary.total_amount)}</b></div>
                        <div><small>Đã trả</small><b>${formatCurrency(summary.paid_amount)}</b></div>
                        <div><small>Còn thiếu</small><b>${formatCurrency(summary.remaining_amount)}</b></div>
                    </div>
                </article>
                ${orders.length ? orders.map((order) => `
                    <article class="customer-order">
                        <div class="order-line">
                            <strong>${formatDate(order.created_at)} - Đơn #${order.id}</strong>
                            <span class="status-pill ${order.status}">${statusText(order.status)}</span>
                        </div>
                        <ul>
                            ${order.items.map((item) => `<li>${item.product_name} x ${item.quantity} - ${formatCurrency(item.price * item.quantity)}</li>`).join('')}
                        </ul>
                        ${order.note ? `<p class="order-note"><strong>Ghi chú:</strong> ${order.note}</p>` : ''}
                        <div class="order-money">
                            <span>Tổng: ${formatCurrency(order.total_amount)}</span>
                            <span>Còn thiếu: ${formatCurrency(order.remaining_amount)}</span>
                        </div>
                        ${order.status === 'unpaid' ? `<div class="order-actions-row"><button class="btn btn-secondary edit-my-order-btn" data-id="${order.id}" type="button">✏️ Sửa đơn</button><button class="btn btn-confirm add-extra-food-btn" data-id="${order.id}" type="button">🍜 Thêm đồ ăn</button></div>` : ''}
                    </article>
                `).join('') : '<p class="muted">Bạn chưa có đơn nào.</p>'}
            `;
        } catch (error) {
            console.error('Lỗi khi tải tổng kết:', error);
            customerSummary.innerHTML = '<p class="muted">Không thể tải tổng kết. Vui lòng thử lại.</p>';
        }
    };

    const openEditOrderModal = (orderId) => {
        editingOrderId = orderId;
        editModalTitle.textContent = `Sửa đơn #${orderId}`;
        editOrderCustomerSelect.innerHTML = customers.map((c) => `<option value="${c.id}" ${selectedCustomer?.id === c.id ? 'selected' : ''}>${c.group_type === 'vjp' ? '★ ' : ''}${c.name}</option>`).join('');
        fetch(`/api/customer-orders?customer_id=${selectedCustomer?.id}`).then(r => r.json()).then(allOrders => {
            const order = allOrders.find((o) => String(o.id) === String(orderId));
            if (!order) { alert('Không tìm thấy đơn.'); return; }
            editOrderPaymentSelect.value = order.payment_method || 'Tiền mặt';
            editOrderNoteInput.value = order.note || '';
            editOrderProductList.innerHTML = allProducts.map((product) => {
                const existing = order.items.find((item) => item.product_id === product.id);
                return `<label class="edit-product-item"><span>${product.name} (${formatCurrency(product.price)})</span><input type="number" min="0" step="1" value="${existing ? existing.quantity : 0}" data-product-id="${product.id}"></label>`;
            }).join('');
            editModal.classList.remove('hidden');
        });
    };

    const saveEditedCustomerOrder = async () => {
        if (!editingOrderId) return;
        const items = [...editOrderProductList.querySelectorAll('input')]
            .map((input) => ({ id: input.dataset.productId, quantity: Number(input.value) }))
            .filter((item) => item.quantity > 0);
        if (!items.length) { alert('Vui lòng chọn ít nhất một món.'); return; }
        const response = await fetch(`/api/customer-orders/${editingOrderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_id: editOrderCustomerSelect.value,
                payment_method: editOrderPaymentSelect.value,
                note: editOrderNoteInput.value.trim(),
                items,
            }),
        });
        const result = await response.json();
        if (!result.success) { alert(result.message || 'Không thể sửa đơn.'); return; }
        editModal.classList.add('hidden');
        editingOrderId = null;
        await loadCustomerSummary();
    };

    const openExtraFoodPanel = (orderId) => {
        lastOrderId = orderId;
        isNewOrder = false; // Đánh dấu là thêm cho đơn cũ, không phải đơn mới đặt
        renderExtraFoodList();
        extraFoodPanel.classList.remove('hidden');
        extraFoodPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const renderExtraFoodList = () => {
        extraFoodList.innerHTML = allProducts.map((product) => `
            <div class="extra-food-item">
                <strong>${product.name}</strong>
                <div class="extra-price-buttons">
                    <button class="btn btn-sm btn-quick-price" data-name="${product.name}" data-price="5000" type="button">5k</button>
                    <button class="btn btn-sm btn-quick-price" data-name="${product.name}" data-price="10000" type="button">10k</button>
                    <button class="btn btn-sm btn-quick-price" data-name="${product.name}" data-price="15000" type="button">15k</button>
                    <button class="btn btn-sm btn-quick-price" data-name="${product.name}" data-price="20000" type="button">20k</button>
                    <div class="custom-price-row">
                        <input type="number" class="custom-price-input" data-name="${product.name}" min="0" step="1000" placeholder="Giá khác">
                        <button class="btn btn-sm btn-confirm add-custom-extra" data-name="${product.name}" type="button">Thêm</button>
                    </div>
                </div>
            </div>
        `).join('');
    };

    const addExtraFood = async (productName, price) => {
        if (!lastOrderId) { alert('Không tìm thấy đơn hàng.'); return; }
        const response = await fetch(`/api/orders/${lastOrderId}/extra`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_name: productName, price }),
        });
        const result = await response.json();
        if (!result.success) { alert(result.message || 'Không thể thêm đồ ăn.'); return; }
        alert(`Đã thêm ${productName} (${formatCurrency(price)}) vào đơn!`);
        await loadCustomerSummary();
    };

    const handleOrderSubmit = async (event) => {
        event.preventDefault();
        if (isDayClosed) {
            alert('Hôm nay đã chốt đơn.');
            return;
        }
        if (!selectedCustomer) {
            alert('Vui lòng chọn tên của bạn trong danh sách.');
            return;
        }
        if (cart.length === 0) {
            alert('Giỏ hàng đang trống.');
            return;
        }
        // Tạo nội dung xác nhận đơn hàng
        const itemsListText = cart.map(item => `- ${item.name} x${item.quantity} (${formatCurrency(item.price * item.quantity)})`).join('\n');
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const confirmMessage = `XÁC NHẬN THÔNG TIN ĐẶT HÀNG:\n\n` +
                               `👤 Người đặt: ${selectedCustomer.name}\n` +
                               `💳 Thanh toán: ${paymentMethod.value}\n` +
                               `📝 Ghi chú: ${orderNote.value.trim() || 'Không có'}\n\n` +
                               `🛒 Danh sách món:\n${itemsListText}\n\n` +
                               `💰 Tổng cộng: ${formatCurrency(total)}\n\n` +
                               `Bạn đã chọn đúng tên và món ăn của mình chưa?`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: selectedCustomer.id,
                    payment_method: paymentMethod.value,
                    note: orderNote.value.trim(),
                    items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
                }),
            });
            const result = await response.json();
            if (!result.success) {
                alert(result.message || 'Không thể đặt hàng.');
                return;
            }
            lastOrderId = result.order_id;
            isNewOrder = true; // Đánh dấu là đơn hàng mới đặt
            showNotification();
            await loadCustomerSummary();
            cart = [];
            updateCart();
            orderForm.reset();
            if (cartDrawer.classList.contains('open')) {
                toggleCart();
            }
            renderExtraFoodList();
            extraFoodPanel.classList.remove('hidden');
            setTimeout(() => extraFoodPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
        } catch (error) {
            console.error('Lỗi khi đặt hàng:', error);
            alert('Không thể kết nối máy chủ để đặt hàng.');
        }
    };

    customerSearch.addEventListener('input', () => {
        customerList.classList.add('active');
        renderCustomerList();
    });
    customerSearch.addEventListener('focus', () => {
        customerList.classList.add('active');
    });
    // Đóng danh sách khi click ra ngoài
    document.addEventListener('click', (event) => {
        if (!customerSearch.contains(event.target) && !customerList.contains(event.target)) {
            customerList.classList.remove('active');
        }
    });

    customerList.addEventListener('click', (event) => {
        const option = event.target.closest('.customer-option');
        if (!option) return;
        selectedCustomer = customers.find((customer) => String(customer.id) === option.dataset.id);
        selectedCustomerText.textContent = `Đã chọn: ${selectedCustomer.name}`;
        selectedCustomerText.className = `muted selected-name ${selectedCustomer.group_type === 'vjp' ? 'vjp' : ''}`;
        renderCustomerList();
        loadCustomerSummary();
        customerList.classList.remove('active'); // Đóng sau khi chọn
    });

    cartFab.addEventListener('click', toggleCart);
    closeCartBtn.addEventListener('click', toggleCart);
    productGrid.addEventListener('click', (event) => {
        if (!event.target.classList.contains('add-to-cart-btn') || event.target.disabled) return;
        addToCart(event.target.dataset.id, event.target.dataset.name, parseFloat(event.target.dataset.price));
        if (!cartDrawer.classList.contains('open')) toggleCart();
    });
    cartItemsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-item-btn')) removeFromCart(event.target.dataset.id);
    });
    orderForm.addEventListener('submit', handleOrderSubmit);

    closeEditModal.addEventListener('click', () => { editModal.classList.add('hidden'); editingOrderId = null; });
    editModal.addEventListener('click', (e) => { if (e.target === editModal) { editModal.classList.add('hidden'); editingOrderId = null; } });
    saveEditOrderBtn.addEventListener('click', saveEditedCustomerOrder);
    const handleGotoPayment = () => {
        if (isNewOrder && selectedCustomer && lastOrderId) {
            window.location.href = `/payment?order_success=1&customer_id=${selectedCustomer.id}&order_id=${lastOrderId}`;
        } else {
            extraFoodPanel.classList.add('hidden');
        }
    };

    closeExtraPanel.addEventListener('click', handleGotoPayment);
    
    const gotoPaymentBtn = document.getElementById('goto-payment-btn');
    if (gotoPaymentBtn) {
        gotoPaymentBtn.addEventListener('click', handleGotoPayment);
    }

    customerSummary.addEventListener('click', (event) => {
        const editBtn = event.target.closest('.edit-my-order-btn');
        const extraBtn = event.target.closest('.add-extra-food-btn');
        if (editBtn) openEditOrderModal(editBtn.dataset.id);
        if (extraBtn) openExtraFoodPanel(extraBtn.dataset.id);
    });

    extraFoodList.addEventListener('click', (event) => {
        const quickBtn = event.target.closest('.btn-quick-price');
        const customBtn = event.target.closest('.add-custom-extra');
        if (quickBtn) {
            addExtraFood(quickBtn.dataset.name, parseFloat(quickBtn.dataset.price));
        }
        if (customBtn) {
            const input = customBtn.closest('.custom-price-row')?.querySelector('.custom-price-input');
            const price = parseFloat(input?.value);
            if (!price || price <= 0) { alert('Vui lòng nhập giá hợp lệ.'); return; }
            addExtraFood(customBtn.dataset.name, price);
        }
    });

    Promise.all([loadDayStatus(), loadCustomers(), loadProducts()]);
    updateCart();
});
