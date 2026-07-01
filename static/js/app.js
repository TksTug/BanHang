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

    let cart = [];
    let customers = [];
    let selectedCustomer = null;
    let isDayClosed = false;

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value.replace(' ', 'T'))) : '';
    const statusText = (status) => status === 'paid' ? 'Đã trả hết' : status === 'partial' ? 'Đã trả một phần' : 'Chưa trả';

    const renderCustomerList = () => {
        const keyword = customerSearch.value.trim().toLowerCase();
        const visible = customers.filter((customer) => customer.name.toLowerCase().includes(keyword));
        customerList.innerHTML = visible.map((customer) => `
            <button class="customer-option ${customer.group_type === 'vjp' ? 'vjp' : ''} ${selectedCustomer?.id === customer.id ? 'selected' : ''}" type="button" data-id="${customer.id}">
                <span>${customer.name}</span>
                <small>${customer.group_type === 'vjp' ? 'Khách VJP' : 'Khách thường'}</small>
            </button>
        `).join('');
    };

    const loadCustomers = async () => {
        const response = await fetch('/api/customers');
        customers = await response.json();
        renderCustomerList();
    };

    const loadDayStatus = async () => {
        const response = await fetch('/api/day-status');
        const data = await response.json();
        isDayClosed = Boolean(data.is_closed);
        dayStatusText.textContent = isDayClosed ? 'Hôm nay đã chốt đơn, chỉ xem lại đơn đã đặt.' : 'Chọn tên, chọn món và đặt hàng.';
        submitOrderBtn.disabled = isDayClosed;
        submitOrderBtn.textContent = isDayClosed ? 'Đã chốt đơn hôm nay' : 'Đặt hàng';
    };

    const loadProducts = async () => {
        try {
            const response = await fetch('/api/products');
            const products = await response.json();
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
                        <p class="product-description">${product.description || ''}</p>
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
                    <span>${result.customer.group_type === 'vjp' ? 'Khách VJP' : 'Khách thường'}</span>
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
                    </article>
                `).join('') : '<p class="muted">Bạn chưa có đơn nào.</p>'}
            `;
        } catch (error) {
            console.error('Lỗi khi tải tổng kết:', error);
            customerSummary.innerHTML = '<p class="muted">Không thể tải tổng kết. Vui lòng thử lại.</p>';
        }
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
            showNotification();
            await loadCustomerSummary();
            cart = [];
            updateCart();
            orderForm.reset();
            toggleCart();
        } catch (error) {
            console.error('Lỗi khi đặt hàng:', error);
            alert('Không thể kết nối máy chủ để đặt hàng.');
        }
    };

    customerSearch.addEventListener('input', renderCustomerList);
    customerList.addEventListener('click', (event) => {
        const option = event.target.closest('.customer-option');
        if (!option) return;
        selectedCustomer = customers.find((customer) => String(customer.id) === option.dataset.id);
        selectedCustomerText.textContent = `Đã chọn: ${selectedCustomer.name}`;
        selectedCustomerText.className = `muted selected-name ${selectedCustomer.group_type === 'vjp' ? 'vjp' : ''}`;
        renderCustomerList();
        loadCustomerSummary();
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

    Promise.all([loadDayStatus(), loadCustomers(), loadProducts()]);
    updateCart();
});
