document.addEventListener('DOMContentLoaded', () => {
    const totalRevenueEl = document.getElementById('total-revenue');
    const outstandingDebtEl = document.getElementById('outstanding-debt');
    const orderCountEl = document.getElementById('order-count');
    const dayToggleBtn = document.getElementById('day-toggle-btn');
    const matrixHead = document.getElementById('matrix-head');
    const matrixBody = document.getElementById('matrix-body');
    const noMatrixMessage = document.getElementById('no-matrix-message');
    const ordersTableBody = document.getElementById('orders-table-body');
    const noOrdersMessage = document.getElementById('no-orders-message');
    const orderSearch = document.getElementById('order-search');
    const orderDateFilter = document.getElementById('order-date-filter');
    const orderStatusFilter = document.getElementById('order-status-filter');

    const customerForm = document.getElementById('customer-form');
    const customerId = document.getElementById('customer-id');
    const customerName = document.getElementById('customer-name');
    const customerGroup = document.getElementById('customer-group');
    const customerActive = document.getElementById('customer-active');
    const resetCustomerForm = document.getElementById('reset-customer-form');
    const customerAdminList = document.getElementById('customer-admin-list');

    const productForm = document.getElementById('product-form');
    const productId = document.getElementById('product-id');
    const productName = document.getElementById('product-name');
    const productPrice = document.getElementById('product-price');
    const productImageUrl = document.getElementById('product-image-url');
    const productImage = document.getElementById('product-image');
    const productDescription = document.getElementById('product-description');
    const productAvailable = document.getElementById('product-available');
    const productSoldOut = document.getElementById('product-sold-out');
    const resetProductForm = document.getElementById('reset-product-form');
    const adminProductList = document.getElementById('admin-product-list');

    const editOrderPanel = document.getElementById('edit-order-panel');
    const editOrderTitle = document.getElementById('edit-order-title');
    const cancelEditOrder = document.getElementById('cancel-edit-order');
    const editOrderForm = document.getElementById('edit-order-form');
    const editOrderId = document.getElementById('edit-order-id');
    const editOrderCustomer = document.getElementById('edit-order-customer');
    const editOrderPaymentMethod = document.getElementById('edit-order-payment-method');
    const editOrderItems = document.getElementById('edit-order-items');

    let allOrders = [];
    let allProducts = [];
    let allCustomers = [];
    let dayClosed = false;

    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    const shortMoney = (amount) => amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(amount)} đ` : 'x';
    const dateOnly = (value) => value ? value.slice(0, 10) : '';
    const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`)) : '';
    const formatDateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value.replace(' ', 'T'))) : '';
    const statusText = (status) => status === 'paid' ? 'Đã trả hết' : status === 'partial' ? 'Trả một phần' : 'Chưa trả';

    const loadDayStatus = async () => {
        const response = await fetch('/api/day-status');
        const data = await response.json();
        dayClosed = Boolean(data.is_closed);
        dayToggleBtn.textContent = dayClosed ? 'Mở nhận đơn hôm nay' : 'Chốt đơn hôm nay';
        dayToggleBtn.classList.toggle('is-closed', dayClosed);
    };

    const toggleDayStatus = async () => {
        const response = await fetch('/api/day-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_closed: !dayClosed }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể cập nhật trạng thái ngày.');
            return;
        }
        await loadDayStatus();
    };

    const loadStats = async () => {
        const response = await fetch('/api/dashboard-stats');
        const stats = await response.json();
        totalRevenueEl.textContent = formatCurrency(stats.total_revenue);
        outstandingDebtEl.textContent = formatCurrency(stats.outstanding_debt);
        orderCountEl.textContent = stats.order_count || 0;
    };

    const loadCustomers = async () => {
        const response = await fetch('/api/customers');
        allCustomers = await response.json();
        renderCustomers();
        renderCustomerOptions();
    };

    const renderCustomers = () => {
        customerAdminList.innerHTML = allCustomers.map((customer) => `
            <article class="customer-admin-item ${customer.group_type === 'vjp' ? 'vjp' : ''} ${customer.is_active ? '' : 'inactive'}">
                <div>
                    <strong>${customer.name}</strong>
                    <span>${customer.group_type === 'vjp' ? 'Khách VJP' : ''}${customer.is_active ? '' : ' - Đã ẩn'}</span>
                </div>
                <div class="product-actions">
                    <button class="btn btn-secondary edit-customer-btn" type="button"
                        data-id="${customer.id}" data-name="${customer.name}" data-group="${customer.group_type}" data-active="${customer.is_active ? '1' : '0'}">Sửa</button>
                    <button class="btn btn-danger delete-customer-btn" type="button" data-id="${customer.id}">Ẩn</button>
                </div>
            </article>
        `).join('');
    };

    const renderCustomerOptions = () => {
        const activeCustomers = allCustomers.filter((customer) => customer.is_active);
        editOrderCustomer.innerHTML = activeCustomers.map((customer) => `
            <option value="${customer.id}">${customer.group_type === 'vjp' ? '★ ' : ''}${customer.name}</option>
        `).join('');
    };

    const resetCustomer = () => {
        customerForm.reset();
        customerId.value = '';
        customerActive.checked = true;
        customerGroup.value = 'regular';
    };

    const saveCustomer = async (event) => {
        event.preventDefault();
        const id = customerId.value;
        const response = await fetch(id ? `/api/customers/${id}` : '/api/customers', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: customerName.value.trim(),
                group_type: customerGroup.value,
                is_active: customerActive.checked,
            }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể lưu khách.');
            return;
        }
        resetCustomer();
        await loadCustomers();
        await refreshOrders();
    };

    const loadMatrix = async () => {
        const response = await fetch('/api/order-matrix');
        const data = await response.json();
        matrixHead.innerHTML = '';
        matrixBody.innerHTML = '';
        if (!data.dates.length || !data.customers.length) {
            noMatrixMessage.classList.remove('hidden');
            return;
        }
        noMatrixMessage.classList.add('hidden');
        matrixHead.innerHTML = `
            <tr>
                <th class="sticky-col">Người đặt</th>
                <th class="debt-col">Tổng nợ</th>
                ${data.dates.map((date) => `<th>${formatDate(date)}</th>`).join('')}
            </tr>
        `;
        data.customers
            .sort((a, b) => (a.group_type === 'vjp' ? -1 : 1) - (b.group_type === 'vjp' ? -1 : 1) || b.total_debt - a.total_debt)
            .forEach((customer) => {
                const row = document.createElement('tr');
                row.className = customer.group_type === 'vjp' ? 'vjp-row' : '';
                row.innerHTML = `
                    <th class="sticky-col">${customer.group_type === 'vjp' ? '★ ' : ''}${customer.customer_name}</th>
                    <td class="debt-cell">${shortMoney(customer.total_debt)}</td>
                    ${data.dates.map((date) => {
                        const cell = customer.dates[date];
                        if (!cell) return '<td class="empty-cell">x</td>';
                        const cls = cell.remaining_amount > 0 ? 'unpaid-cell' : 'paid-cell';
                        return `<td class="${cls}"><strong>${shortMoney(cell.total_amount)}</strong><span>Còn: ${shortMoney(cell.remaining_amount)}</span></td>`;
                    }).join('')}
                `;
                matrixBody.appendChild(row);
            });
    };

    const loadOrders = async () => {
        const response = await fetch('/api/orders');
        allOrders = await response.json();
        renderOrders();
    };

    const filteredOrders = () => {
        const keyword = orderSearch.value.trim().toLowerCase();
        const status = orderStatusFilter.value;
        const orderDate = orderDateFilter.value;
        return allOrders.filter((order) => {
            const itemText = order.items.map((item) => item.product_name).join(' ').toLowerCase();
            const noteText = (order.note || '').toLowerCase();
            const matchesKeyword = !keyword || order.customer_name.toLowerCase().includes(keyword) || itemText.includes(keyword) || noteText.includes(keyword);
            const matchesStatus = !status || order.status === status;
            const matchesDate = !orderDate || dateOnly(order.created_at) === orderDate;
            return matchesKeyword && matchesStatus && matchesDate;
        });
    };

    const renderOrders = () => {
        const orders = filteredOrders();
        ordersTableBody.innerHTML = '';
        if (!orders.length) {
            noOrdersMessage.classList.remove('hidden');
            return;
        }
        noOrdersMessage.classList.add('hidden');
        orders.forEach((order) => {
            const row = document.createElement('tr');
            row.className = order.group_type === 'vjp' ? 'vjp-row' : '';
            const itemsText = order.items.map((item) => `${item.product_name} x ${item.quantity}`).join(', ');
            const paymentsText = order.payments.length
                ? order.payments.map((payment) => `${formatCurrency(payment.amount)} - ${payment.method || 'Không ghi'} (${formatDateTime(payment.created_at)})`).join('<br>')
                : '<span class="table-note">Chưa có lần trả nào</span>';
            row.innerHTML = `
                <td>${formatDateTime(order.created_at)}</td>
                <td>
                    <strong>${order.group_type === 'vjp' ? '★ ' : ''}${order.customer_name}</strong>
                    <span class="table-note">#${order.id} - ${order.payment_method}</span>
                </td>
                <td>${itemsText}${order.note ? `<p class="order-note"><strong>Note:</strong> ${order.note}</p>` : ''}</td>
                <td>${formatCurrency(order.total_amount)}</td>
                <td>
                    <div class="paid-display-val"><strong>${formatCurrency(order.paid_amount)}</strong></div>
                    <div class="payment-history">${paymentsText}</div>
                </td>
                <td>${formatCurrency(order.remaining_amount)}</td>
                <td><span class="status-pill ${order.status}">${statusText(order.status)}</span></td>
                <td>
                    <div class="inline-payment-row">
                        <input type="number" class="payment-amount-input" data-id="${order.id}" min="0" step="1000" placeholder="Số tiền trả">
                        <button class="btn btn-confirm add-payment-btn" type="button" data-id="${order.id}">Thêm trả</button>
                    </div>
                    ${order.status !== 'paid' ? `<button class="btn btn-primary mark-paid-btn" type="button" data-id="${order.id}">Đã thanh toán</button>` : ''}
                    ${order.paid_amount > 0 ? `<button class="btn btn-secondary reset-paid-btn" type="button" data-id="${order.id}">Đặt lại (về 0đ)</button>` : ''}
                    <button class="btn btn-secondary edit-order-btn" type="button" data-id="${order.id}">Sửa đơn</button>
                    <button class="btn btn-danger delete-order-btn" type="button" data-id="${order.id}">Xóa</button>
                </td>
            `;
            ordersTableBody.appendChild(row);
        });
    };

    const refreshOrders = async () => {
        await Promise.all([loadStats(), loadOrders(), loadMatrix()]);
    };

    const setPayment = async (orderId, paidAmount) => {
        const response = await fetch(`/api/orders/${orderId}/payment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paid_amount: paidAmount }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể cập nhật thanh toán.');
            return;
        }
        await refreshOrders();
    };

    const addPayment = async (orderId) => {
        const input = ordersTableBody.querySelector(`.payment-amount-input[data-id="${orderId}"]`);
        const amount = parseFloat(input?.value);
        if (!amount || amount <= 0) {
            alert('Vui lòng nhập số tiền hợp lệ.');
            if (input) input.focus();
            return;
        }
        const order = allOrders.find((o) => String(o.id) === String(orderId));
        if (order) {
            const remaining = Math.max(order.total_amount - (order.paid_amount || 0), 0);
            if (amount > remaining + 0.01) {
                alert(`Số tiền trả (${formatCurrency(amount)}) không được vượt quá số tiền còn nợ (${formatCurrency(remaining)}).`);
                if (input) input.focus();
                return;
            }
        }
        const method = order?.payment_method || 'Tiền mặt';
        const response = await fetch(`/api/orders/${orderId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, method, note: '' }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể thêm lần trả tiền.');
            return;
        }
        await refreshOrders();
    };

    const loadProducts = async () => {
        const response = await fetch('/api/products');
        allProducts = await response.json();
        renderProducts();
    };

    const renderProducts = () => {
        adminProductList.innerHTML = allProducts.map((product) => `
            <article class="admin-product ${product.is_available ? 'is-available' : ''} ${product.is_sold_out ? 'sold-out' : ''}" data-id="${product.id}">
                <img src="${product.image_url || 'https://via.placeholder.com/120x90.png?text=Mon'}" alt="${product.name}">
                <div>
                    <strong>${product.name}</strong>
                    <span>${formatCurrency(product.price)}</span>
                    <p>${product.description || ''}</p>
                    <span class="availability-label">${product.is_available ? 'Đang hiển thị' : 'Đang ẩn'}${product.is_sold_out ? ' - Đã hết món' : ''}</span>
                </div>
                <div class="product-actions">
                    <button class="btn ${product.is_available ? 'btn-warning' : 'btn-confirm'} toggle-available-btn" type="button" data-id="${product.id}" data-available="${product.is_available ? '0' : '1'}">
                        ${product.is_available ? 'Ẩn món' : 'Bật bán'}
                    </button>
                    <button class="btn ${product.is_sold_out ? 'btn-confirm' : 'btn-warning'} toggle-sold-out-btn" type="button" data-id="${product.id}" data-sold-out="${product.is_sold_out ? '0' : '1'}">
                        ${product.is_sold_out ? 'Còn món' : 'Hết món'}
                    </button>
                    <button class="btn btn-secondary edit-product-btn" type="button"
                        data-id="${product.id}" data-name="${product.name}" data-price="${product.price}"
                        data-image="${product.image_url || ''}" data-available="${product.is_available ? '1' : '0'}"
                        data-sold-out="${product.is_sold_out ? '1' : '0'}" data-description="${product.description || ''}">Sửa</button>
                    <button class="btn btn-danger delete-product-btn" type="button" data-id="${product.id}">Xóa</button>
                </div>
            </article>
        `).join('');
    };

    const resetProduct = () => {
        productForm.reset();
        productId.value = '';
        productAvailable.checked = false;
        productSoldOut.checked = false;
        productForm.querySelector('button[type="submit"]').textContent = 'Lưu món';
    };

    const saveProduct = async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('name', productName.value.trim());
        formData.append('price', productPrice.value);
        formData.append('image_url', productImageUrl.value.trim());
        formData.append('description', productDescription.value.trim());
        formData.append('is_available', productAvailable.checked ? '1' : '0');
        formData.append('is_sold_out', productSoldOut.checked ? '1' : '0');
        if (productImage.files[0]) formData.append('image', productImage.files[0]);
        const id = productId.value;
        const response = await fetch(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body: formData });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể lưu món.');
            return;
        }
        resetProduct();
        await loadProducts();
    };

    const toggleProductFlag = async (id, field, value) => {
        const response = await fetch(`/api/products/${id}/${field}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(field === 'availability' ? { is_available: value } : { is_sold_out: value }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể cập nhật món.');
            return;
        }
        await loadProducts();
    };

    const openEditOrder = (orderId) => {
        const order = allOrders.find((item) => String(item.id) === String(orderId));
        if (!order) return;
        editOrderPanel.classList.remove('hidden');
        editOrderTitle.textContent = `Sửa đơn #${order.id}`;
        editOrderId.value = order.id;
        editOrderCustomer.value = order.customer_id;
        editOrderPaymentMethod.value = order.payment_method;
        let noteBox = document.getElementById('edit-order-note');
        if (!noteBox) {
            noteBox = document.createElement('textarea');
            noteBox.id = 'edit-order-note';
            noteBox.placeholder = 'Ghi chú của khách';
            editOrderPaymentMethod.insertAdjacentElement('afterend', noteBox);
        }
        noteBox.value = order.note || '';
        editOrderItems.innerHTML = allProducts.map((product) => {
            const existing = order.items.find((item) => item.product_id === product.id);
            return `
                <label class="order-edit-item">
                    <span>${product.name} (${formatCurrency(product.price)})</span>
                    <input type="number" min="0" step="1" value="${existing ? existing.quantity : 0}" data-product-id="${product.id}">
                </label>
            `;
        }).join('');
        editOrderPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const saveEditedOrder = async (event) => {
        event.preventDefault();
        const items = [...editOrderItems.querySelectorAll('input')]
            .map((input) => ({ id: input.dataset.productId, quantity: Number(input.value) }))
            .filter((item) => item.quantity > 0);
        const response = await fetch(`/api/orders/${editOrderId.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_id: editOrderCustomer.value,
                payment_method: editOrderPaymentMethod.value,
                note: document.getElementById('edit-order-note')?.value || '',
                items,
            }),
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.message || 'Không thể sửa đơn.');
            return;
        }
        editOrderPanel.classList.add('hidden');
        await refreshOrders();
    };

    dayToggleBtn.addEventListener('click', toggleDayStatus);
    customerForm.addEventListener('submit', saveCustomer);
    resetCustomerForm.addEventListener('click', resetCustomer);
    productForm.addEventListener('submit', saveProduct);
    resetProductForm.addEventListener('click', resetProduct);
    editOrderForm.addEventListener('submit', saveEditedOrder);
    cancelEditOrder.addEventListener('click', () => editOrderPanel.classList.add('hidden'));
    [orderSearch, orderDateFilter, orderStatusFilter].forEach((input) => input.addEventListener('input', renderOrders));

    customerAdminList.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('.edit-customer-btn');
        const deleteBtn = event.target.closest('.delete-customer-btn');
        if (editBtn) {
            customerId.value = editBtn.dataset.id;
            customerName.value = editBtn.dataset.name;
            customerGroup.value = editBtn.dataset.group;
            customerActive.checked = editBtn.dataset.active === '1';
        }
        if (deleteBtn) {
            if (!confirm('Ẩn khách này khỏi danh sách đặt món?')) return;
            await fetch(`/api/customers/${deleteBtn.dataset.id}`, { method: 'DELETE' });
            await loadCustomers();
        }
    });

    adminProductList.addEventListener('click', async (event) => {
        const target = event.target;
        if (target.classList.contains('toggle-available-btn')) await toggleProductFlag(target.dataset.id, 'availability', target.dataset.available === '1');
        if (target.classList.contains('toggle-sold-out-btn')) await toggleProductFlag(target.dataset.id, 'sold-out', target.dataset.soldOut === '1');
        if (target.classList.contains('edit-product-btn')) {
            productId.value = target.dataset.id;
            productName.value = target.dataset.name;
            productPrice.value = target.dataset.price;
            productImageUrl.value = target.dataset.image;
            productDescription.value = target.dataset.description;
            productAvailable.checked = target.dataset.available === '1';
            productSoldOut.checked = target.dataset.soldOut === '1';
            productImage.value = '';
            productForm.querySelector('button[type="submit"]').textContent = 'Cập nhật món';
            productName.focus();
        }
        if (target.classList.contains('delete-product-btn')) {
            if (!confirm('Xóa món này?')) return;
            const response = await fetch(`/api/products/${target.dataset.id}`, { method: 'DELETE' });
            const result = await response.json();
            if (!result.success) alert(result.message || 'Không thể xóa món.');
            await loadProducts();
        }
    });

    ordersTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const orderId = target.dataset.id;
        if (target.classList.contains('add-payment-btn')) await addPayment(orderId);
        if (target.classList.contains('mark-paid-btn')) {
            const order = allOrders.find((o) => String(o.id) === String(orderId));
            if (order) await setPayment(orderId, order.total_amount);
        }
        if (target.classList.contains('reset-paid-btn')) {
            if (confirm('Đặt lại số tiền đã trả của đơn này về 0đ?')) {
                await setPayment(orderId, 0);
            }
        }
        if (target.classList.contains('edit-order-btn')) openEditOrder(orderId);
        if (target.classList.contains('delete-order-btn')) {
            if (!confirm('Xóa đơn này?')) return;
            const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!result.success) alert(result.message || 'Không thể xóa đơn.');
            await refreshOrders();
        }
    });

    Promise.all([loadDayStatus(), loadCustomers(), loadProducts(), refreshOrders()]);
});
