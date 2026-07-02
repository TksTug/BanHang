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
            
            const cartExtraProductsList = document.getElementById('cart-extra-products-list');
            productGrid.innerHTML = '';
            if (cartExtraProductsList) cartExtraProductsList.innerHTML = '';
            
            if (!products.length) {
                productGrid.innerHTML = '<p class="muted">Hôm nay chưa có món nào được mở bán.</p>';
                return;
            }

            products.forEach((product) => {
                const soldOut = Boolean(product.is_sold_out);
                
                // 1. Render ra trang chủ làm menu món chính như cũ
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

                // 2. Render vào danh sách món phụ Gọi thêm đồ ăn kèm bên trong giỏ hàng
                if (cartExtraProductsList) {
                    const item = document.createElement('div');
                    item.className = 'cart-extra-product-item';
                    item.style.display = 'flex';
                    item.style.flexDirection = 'column';
                    item.style.gap = '8px';
                    item.style.paddingBottom = '12px';
                    item.style.borderBottom = '1px solid var(--border-color)';
                    
                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 700; font-size: 0.98rem; color: var(--text-color);">${product.name}</span>
                            <span style="font-size: 0.85rem; color: var(--muted-color);">(Gốc: ${formatCurrency(product.price)})</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            <button class="btn btn-secondary quick-price-btn" data-product-id="${product.id}" data-name="${product.name}" data-price="5000" type="button" style="padding: 4px 8px; font-size: 0.8rem; min-height: auto; height: 28px;" ${soldOut ? 'disabled' : ''}>+5k</button>
                            <button class="btn btn-secondary quick-price-btn" data-product-id="${product.id}" data-name="${product.name}" data-price="10000" type="button" style="padding: 4px 8px; font-size: 0.8rem; min-height: auto; height: 28px;" ${soldOut ? 'disabled' : ''}>+10k</button>
                            <button class="btn btn-secondary quick-price-btn" data-product-id="${product.id}" data-name="${product.name}" data-price="15000" type="button" style="padding: 4px 8px; font-size: 0.8rem; min-height: auto; height: 28px;" ${soldOut ? 'disabled' : ''}>+15k</button>
                            <button class="btn btn-secondary quick-price-btn" data-product-id="${product.id}" data-name="${product.name}" data-price="20000" type="button" style="padding: 4px 8px; font-size: 0.8rem; min-height: auto; height: 28px;" ${soldOut ? 'disabled' : ''}>+20k</button>
                            <div style="display: flex; gap: 4px; align-items: center; margin-left: auto;">
                                <input type="number" class="custom-extra-price-input" data-product-id="${product.id}" data-name="${product.name}" placeholder="đ" min="1000" step="1000" style="width: 70px; padding: 4px 6px; font-size: 0.85rem; border: 1px solid var(--border-color); border-radius: 4px; height: 28px;" ${soldOut ? 'disabled' : ''}>
                                <button class="btn btn-confirm add-custom-extra-btn" data-product-id="${product.id}" data-name="${product.name}" type="button" style="padding: 4px 8px; font-size: 0.8rem; min-height: auto; height: 28px; background: var(--green-color); color: white;" ${soldOut ? 'disabled' : ''}>Thêm</button>
                            </div>
                        </div>
                    `;
                    cartExtraProductsList.appendChild(item);
                }
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

    const addExtraToCart = async (productId, productName, price) => {
        if (isNewOrder) {
            const extraId = `extra-${productId}-${price}`;
            const existingItem = cart.find((item) => item.id === extraId);
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    id: extraId,
                    productId: parseInt(productId),
                    name: `${productName} (thêm)`,
                    price: price,
                    quantity: 1
                });
            }
            updateCart();
        } else {
            if (!lastOrderId) { alert('Không tìm thấy đơn hàng cần thêm.'); return; }
            try {
                const response = await fetch(`/api/orders/${lastOrderId}/extra`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_name: productName, price }),
                });
                const result = await response.json();
                if (!result.success) {
                    alert(result.message || 'Không thể thêm đồ ăn.');
                } else {
                    await loadCustomerSummary();
                }
            } catch (error) {
                console.error('Lỗi khi thêm đồ ăn:', error);
                alert('Lỗi kết nối máy chủ.');
            }
        }
    };

    const openExtraFoodPanel = (orderId) => {
        lastOrderId = orderId;
        isNewOrder = false;
        const cartExtraPanel = document.getElementById('cart-extra-panel');
        if (cartExtraPanel) {
            cartExtraPanel.style.right = '0';
        }
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
                    items: cart.map((item) => ({
                        id: item.productId || item.id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity
                    })),
                }),
            });
            const result = await response.json();
            if (!result.success) {
                alert(result.message || 'Không thể đặt hàng.');
                return;
            }
            lastOrderId = result.order_id;
            cart = [];
            updateCart();
            orderForm.reset();
            if (cartDrawer.classList.contains('open')) {
                toggleCart();
            }
            window.location.href = `/payment?order_success=1&customer_id=${selectedCustomer.id}&order_id=${result.order_id}`;
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
    // Lắng nghe sự kiện thêm món chính ở trang chủ
    productGrid.addEventListener('click', (event) => {
        if (!event.target.classList.contains('add-to-cart-btn') || event.target.disabled) return;
        addToCart(event.target.dataset.id, event.target.dataset.name, parseFloat(event.target.dataset.price));
        if (!cartDrawer.classList.contains('open')) toggleCart();
    });

    // Logic trượt mở/đóng Khung nhỏ Gọi đồ ăn thêm bên trong giỏ hàng
    const cartExtraPanel = document.getElementById('cart-extra-panel');
    const openCartExtraBtn = document.getElementById('open-cart-extra-btn');
    const closeCartExtraBtn = document.getElementById('close-cart-extra-btn');
    const confirmCartExtraBtn = document.getElementById('confirm-cart-extra-btn');
    const cartExtraProductsList = document.getElementById('cart-extra-products-list');

    if (openCartExtraBtn && cartExtraPanel) {
        openCartExtraBtn.addEventListener('click', () => {
            isNewOrder = true; // Đây là đơn hàng mới đang soạn
            cartExtraPanel.style.right = '0';
        });
    }
    if (closeCartExtraBtn && cartExtraPanel) {
        closeCartExtraBtn.addEventListener('click', () => {
            cartExtraPanel.style.right = '-340px';
        });
    }
    if (confirmCartExtraBtn && cartExtraPanel) {
        confirmCartExtraBtn.addEventListener('click', () => {
            cartExtraPanel.style.right = '-340px';
        });
    }

    // Lắng nghe sự kiện chọn mức giá đồ ăn kèm bên trong panel
    if (cartExtraProductsList) {
        cartExtraProductsList.addEventListener('click', (event) => {
            const quickBtn = event.target.closest('.quick-price-btn');
            const customBtn = event.target.closest('.add-custom-extra-btn');
            
            if (quickBtn) {
                const pId = quickBtn.dataset.productId;
                const name = quickBtn.dataset.name;
                const price = parseFloat(quickBtn.dataset.price);
                addExtraToCart(pId, name, price);
                
                // Hiệu ứng nhấp nháy nút để báo hiệu đã thêm
                const origText = quickBtn.textContent;
                quickBtn.textContent = '✓';
                quickBtn.style.background = 'var(--green-color)';
                quickBtn.style.color = 'white';
                setTimeout(() => {
                    quickBtn.textContent = origText;
                    quickBtn.style.background = '';
                    quickBtn.style.color = '';
                }, 800);
            }
            
            if (customBtn) {
                const pId = customBtn.dataset.productId;
                const name = customBtn.dataset.name;
                const container = customBtn.closest('div');
                const input = container ? container.querySelector('.custom-extra-price-input') : null;
                const price = parseFloat(input ? input.value : 0);
                
                if (!price || price < 1000) {
                    alert('Vui lòng nhập số tiền hợp lệ (từ 1.000đ trở lên).');
                    if (input) input.focus();
                    return;
                }
                
                addExtraToCart(pId, name, price);
                if (input) input.value = ''; // Reset input
                
                const origText = customBtn.textContent;
                customBtn.textContent = '✓';
                customBtn.style.background = '#1b4d3e';
                setTimeout(() => {
                    customBtn.textContent = origText;
                    customBtn.style.background = '';
                }, 800);
            }
        });
    }

    cartItemsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-item-btn')) removeFromCart(event.target.dataset.id);
    });
    orderForm.addEventListener('submit', handleOrderSubmit);

    closeEditModal.addEventListener('click', () => { editModal.classList.add('hidden'); editingOrderId = null; });
    editModal.addEventListener('click', (e) => { if (e.target === editModal) { editModal.classList.add('hidden'); editingOrderId = null; } });
    saveEditOrderBtn.addEventListener('click', saveEditedCustomerOrder);

    customerSummary.addEventListener('click', (event) => {
        const editBtn = event.target.closest('.edit-my-order-btn');
        if (editBtn) {
            openEditOrderModal(editBtn.dataset.id);
            return;
        }
        
        const extraBtn = event.target.closest('.add-extra-food-btn');
        if (extraBtn) {
            openExtraFoodPanel(extraBtn.dataset.id);
            return;
        }
    });

    Promise.all([loadDayStatus(), loadCustomers(), loadProducts()]);
    updateCart();
});
