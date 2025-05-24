// restaurant_pos/public/js/pos/pos_view.js
frappe.provide('restaurant_pos.point_of_sale');

restaurant_pos.point_of_sale.PosView = class PosView {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.page = wrapper.page;

        // Set page title
        this.page.set_title('Restaurant POS');

        // Initialize state management
        this.state = {
            activeTab: 'menu',
            isSearchActive: false,
            isCartExpanded: false,
            currentCategory: 'all',
            isOrientationLandscape: window.innerWidth > window.innerHeight,
            cartItemCount: 0
        };

        // Initialize responsive sizing
        this.updateDeviceDetection();

        // Handle window resize and orientation change
        this.setupResponsiveListeners();

        // Initialize data
        this.active_orders = [];
        this.cart_items_data = [];
        this.selected_table = null;
        this.active_order_id = null;

        // Add app-level CSS
        this.injectGlobalStyles();

        // Set up the page
        this.setup_page_actions();
        this.setup_layout();

        // Load data
        this.load_data();
    }

    updateDeviceDetection() {
        this.is_mobile = window.innerWidth < 768;
        this.is_tablet = window.innerWidth >= 768 && window.innerWidth < 1200;
        this.is_desktop = window.innerWidth >= 1200;
        this.state.isOrientationLandscape = window.innerWidth > window.innerHeight;
    }

    setupResponsiveListeners() {
        // Handle both resize and orientation change events
        $(window).on('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => this.handleOrientationChange());
    }

    handleResize() {
        const wasTablet = this.is_tablet;
        const wasMobile = this.is_mobile;
        const prevOrientation = this.state.isOrientationLandscape;

        this.updateDeviceDetection();

        // Only rebuild if device class or orientation changed
        if (wasTablet !== this.is_tablet ||
            wasMobile !== this.is_mobile ||
            prevOrientation !== this.state.isOrientationLandscape) {
            this.rebuildLayout();
        }
    }

    handleOrientationChange() {
        // Use a timeout to ensure proper handling after the orientation fully changes
        setTimeout(() => {
            this.updateDeviceDetection();
            this.rebuildLayout();
        }, 300);
    }

    rebuildLayout() {
        // Store important state before rebuilding
        const activeTab = this.state.activeTab;
        const currentScrollPositions = this.captureScrollPositions();

        // Rebuild the entire layout
        this.setup_layout();

        // Restore state after rebuilding
        this.restoreState(activeTab, currentScrollPositions);
    }

    captureScrollPositions() {
        return {
            menuScroll: this.menu_items_grid ? this.menu_items_grid.scrollTop() : 0,
            cartScroll: this.cart_items ? this.cart_items.scrollTop() : 0,
            ordersScroll: this.orders_list ? this.orders_list.scrollTop() : 0
        };
    }

    restoreState(activeTab, scrollPositions) {
        // Restore active tab
        if (this.is_mobile) {
            this.setActiveTab(activeTab || 'menu');
        }

        // Restore scroll positions
        if (this.menu_items_grid) this.menu_items_grid.scrollTop(scrollPositions.menuScroll);
        if (this.cart_items) this.cart_items.scrollTop(scrollPositions.cartScroll);
        if (this.orders_list) this.orders_list.scrollTop(scrollPositions.ordersScroll);

        // Restore search state
        if (this.state.isSearchActive && this.search_box) {
            this.search_box.find('.search-input').val(this.state.searchTerm || '');
            this.search_box.find('.search-clear').toggle(!!this.state.searchTerm);
        }
    }

    injectGlobalStyles() {
        const styleId = 'pos-responsive-styles';

        // Remove existing style if present
        $('#' + styleId).remove();

        // Add the responsive styles from separate CSS file
        $('<link id="' + styleId + '" rel="stylesheet">')
            .attr('href', '/assets/restaurant_pos/css/pos_view.css')
            .appendTo('head');
    }

    setup_page_actions() {
        // Primary action buttons
        this.page.set_primary_action(__('New Order'), () => this.create_new_order(), 'plus');

        // Secondary actions
        this.page.add_menu_item(__('View Tables'), () => this.view_tables());
        this.page.add_menu_item(__('Sync Data'), () => this.sync_data());
        this.page.add_menu_item(__('POS Settings'), () => this.open_settings());

        // Add buttons in the standard page actions area
        this.page.add_action_item(__('Kitchen'), () => this.view_kitchen_display(), 'kitchen');

        // Add mobile-specific menu items if needed
        if (this.is_mobile) {
            this.page.add_action_item(__('Orders'), () => this.toggle_orders_view(), 'list');
        }
    }

    setup_layout() {
        $(this.wrapper).empty();

        // Create the main layout container with responsive classes
        let layout_classes = 'pos-layout';
        if (this.is_mobile) {
            layout_classes += ' pos-layout-mobile';
        } else if (this.is_tablet) {
            layout_classes += ' pos-layout-tablet';
            layout_classes += this.state.isOrientationLandscape ? ' pos-layout-landscape' : ' pos-layout-portrait';
        }

        this.layout_container = $(`<div class="${layout_classes}"></div>`);
        $(this.wrapper).append(this.layout_container);

        if (this.is_mobile) {
            // Mobile layout (vertical stacking with tabs)
            this.setup_mobile_layout();
        } else if (this.is_tablet && !this.state.isOrientationLandscape) {
            // Tablet portrait layout (similar to mobile but larger)
            this.setup_tablet_portrait_layout();
        } else {
            // Tablet landscape and desktop layout (side by side)
            this.setup_desktop_layout();
        }

        // Add floating cart button for mobile
        if (this.is_mobile) {
            this.add_floating_cart_button();
        }

        // Setup touch-friendly event handlers
        this.setup_touch_events();
    }

    setup_mobile_layout() {
        // Create tab navigation for mobile
        this.tab_nav = $(`
            <div class="pos-tabs">
                <div class="tab" data-tab="menu">
                    <span class="tab-icon">🍽️</span>
                    <span>Menu</span>
                </div>
                <div class="tab" data-tab="cart">
                    <span class="tab-icon">🛒</span>
                    <span>Cart</span>
                    <span class="badge cart-count" style="display: none;">0</span>
                </div>
                <div class="tab" data-tab="orders">
                    <span class="tab-icon">📋</span>
                    <span>Orders</span>
                    <span class="badge orders-count" style="display: none;">0</span>
                </div>
            </div>
        `);
        this.layout_container.append(this.tab_nav);

        // Create tab containers
        this.menu_container = $('<div class="pos-tab-content pos-menu-container" data-tab="menu"></div>');
        this.cart_container = $('<div class="pos-tab-content pos-cart-container" data-tab="cart"></div>');
        this.orders_container = $('<div class="pos-tab-content pos-orders-container" data-tab="orders"></div>');

        this.layout_container.append(this.menu_container);
        this.layout_container.append(this.cart_container);
        this.layout_container.append(this.orders_container);

        // Setup tab navigation events
        this.tab_nav.find('.tab').on('click', (e) => {
            const tab = $(e.currentTarget).data('tab');
            this.setActiveTab(tab);
        });

        // Initialize sections
        this.init_menu_section();
        this.init_cart_section();
        this.init_orders_section();

        // Initially set the active tab
        this.setActiveTab(this.state.activeTab || 'menu');

        // Update cart and order badges
        this.updateMobileBadges();
    }

    setup_tablet_portrait_layout() {
        // Similar to mobile but with larger elements
        this.setup_mobile_layout();
    }

    setup_desktop_layout() {
        // Create containers for different sections
        this.menu_container = $('<div class="pos-menu-container"></div>');
        this.right_container = $('<div class="pos-right-container"></div>');

        this.layout_container.append(this.menu_container);
        this.layout_container.append(this.right_container);

        this.cart_container = $('<div class="pos-cart-container"></div>');
        this.orders_container = $('<div class="pos-orders-container"></div>');

        this.right_container.append(this.cart_container);
        this.right_container.append(this.orders_container);

        // Initialize sections
        this.init_menu_section();
        this.init_cart_section();
        this.init_orders_section();
    }

    setActiveTab(tab) {
        this.state.activeTab = tab;

        // Update tab UI
        this.tab_nav.find('.tab').removeClass('active');
        this.tab_nav.find(`.tab[data-tab="${tab}"]`).addClass('active');

        // Update content visibility
        this.layout_container.find('.pos-tab-content').removeClass('active');
        this.layout_container.find(`.pos-tab-content[data-tab="${tab}"]`).addClass('active');

        // Manage Floating Action Button for mobile
        if (this.is_mobile) {
            if (tab === 'menu' && this.cart_items_data.length > 0) {
                this.add_floating_cart_button(); // Ensures it's there and updated
            } else {
                if (this.cart_floating_button) {
                    this.cart_floating_button.remove();
                    this.cart_floating_button = null; // Clear the reference
                }
            }
        }
    }

    updateMobileBadges() {
        if (!this.is_mobile) return;

        const cartCount = this.cart_items_data.length;
        const cartBadge = this.tab_nav.find('.cart-count');
        if (cartCount > 0) {
            cartBadge.text(cartCount).show();
        } else {
            cartBadge.hide();
        }

        const ordersCount = this.active_orders.length;
        const ordersBadge = this.tab_nav.find('.orders-count');
        if (ordersCount > 0) {
            ordersBadge.text(ordersCount).show();
        } else {
            ordersBadge.hide();
        }

        // Manage FAB based on cart count and active tab
        if (this.state.activeTab === 'menu') {
            if (cartCount > 0) {
                this.add_floating_cart_button(); // Will create or update
            } else {
                // Cart is empty, remove button if it exists
                if (this.cart_floating_button) {
                    this.cart_floating_button.remove();
                    this.cart_floating_button = null;
                }
            }
        }
        // If not on menu tab, FAB should have been removed by setActiveTab
    }

    add_floating_cart_button() {
        // Remove existing button if any, to prevent duplicates and handle updates
        if (this.cart_floating_button) {
            this.cart_floating_button.remove();
            this.cart_floating_button = null;
        }

        // Only add if we're on the menu tab and have items in cart
        if (!this.is_mobile || this.state.activeTab !== 'menu' || this.cart_items_data.length === 0) {
            return; // Do not add if not on mobile, not on menu tab, or cart is empty
        }

        this.cart_floating_button = $(`
            <button class="cart-floating-button">
                <span class="cart-icon">🛒</span>
                <span class="cart-badge">${this.cart_items_data.length}</span>
            </button>
        `);

        // Append to body to ensure it's above other page elements as per its z-index
        $('body').append(this.cart_floating_button);

        this.cart_floating_button.on('click', () => {
            this.setActiveTab('cart'); // Clicking FAB takes you to cart tab
        });
    }

    setup_touch_events() {
        // Add class to make all buttons more touch-friendly
        $('.btn, button').addClass('touch-target');
    }

    init_menu_section() {
        this.menu_section = $('<div class="menu-section"></div>');
        this.menu_container.append(this.menu_section);

        this.category_selector = $('<div class="category-selector"></div>');
        this.menu_items_grid = $('<div class="menu-items-grid"></div>');

        this.menu_section.append(this.category_selector);
        this.menu_section.append(this.menu_items_grid);

        // Add search box for menu items
        this.search_box = $(`
            <div class="search-container">
                <input type="text" class="form-control search-input" placeholder="Search menu items...">
                <button class="btn search-clear" style="display: none;">×</button>
            </div>
        `);
        this.menu_section.prepend(this.search_box);

        // Search functionality
        this.search_box.find('.search-input').on('input', (e) => {
            const search_term = $(e.target).val().toLowerCase();
            this.state.searchTerm = search_term;
            this.state.isSearchActive = !!search_term;

            if (search_term) {
                this.menu_items_grid.find('.menu-item').hide();
                this.menu_items.forEach(item => {
                    if (item.name.toLowerCase().includes(search_term)) {
                        this.menu_items_grid.find(`.menu-item[data-id="${item.id}"]`).show();
                    }
                });
                // Show clear button
                this.search_box.find('.search-clear').show();
            } else {
                // Reset to current category if no search term
                this.filter_items(this.state.currentCategory || 'all');
                this.search_box.find('.search-clear').hide();
            }
        });

        // Clear search
        this.search_box.find('.search-clear').on('click', () => {
            this.search_box.find('.search-input').val('');
            this.state.searchTerm = '';
            this.state.isSearchActive = false;
            this.filter_items(this.state.currentCategory || 'all');
            this.search_box.find('.search-clear').hide();
        });
    }

    init_cart_section() {
        this.cart_section = $('<div class="cart-section"></div>');
        this.cart_container.append(this.cart_section);

        // Cart header
        this.cart_header = $(`
            <div class="cart-header">
                <h3>Current Order</h3>
                <div class="table-selector">
                    <button class="btn btn-default select-table-btn">Select Table</button>
                </div>
            </div>
        `);
        this.cart_section.append(this.cart_header);

        // Cart items container
        this.cart_items = $('<div class="cart-items"><div class="empty-cart"><div class="empty-cart-icon">🛒</div>Cart is empty</div></div>');
        this.cart_section.append(this.cart_items);

        // Cart summary
        this.cart_summary = $(`
            <div class="cart-summary">
                <div class="summary-row">
                    <span>Subtotal</span>
                    <span class="subtotal-value">${this.format_currency(0)}</span>
                </div>
                <div class="summary-row">
                    <span>Tax (10%)</span>
                    <span class="tax-value">${this.format_currency(0)}</span>
                </div>
                <div class="summary-row total">
                    <span>Total</span>
                    <span class="total-value">${this.format_currency(0)}</span>
                </div>
            </div>
        `);
        this.cart_section.append(this.cart_summary);

        // Cart actions with touch-friendly buttons
        this.cart_actions = $(`
            <div class="cart-actions">
                <button class="btn btn-clear">
                    <span class="btn-icon">🗑️</span>
                    <span class="btn-text">Clear</span>
                </button>
                <button class="btn btn-send-kitchen">
                    <span class="btn-icon">🍳</span>
                    <span class="btn-text">Send to Kitchen</span>
                </button>
                <button class="btn btn-payment">
                    <span class="btn-icon">💳</span>
                    <span class="btn-text">Payment</span>
                </button>
            </div>
        `);
        this.cart_section.append(this.cart_actions);

        // Setup event handlers
        this.setup_cart_events();
    }

    init_orders_section() {
        this.orders_section = $(`
            <div class="active-orders-section">
                <h3>Active Orders</h3>
                <div class="active-orders-list"></div>
            </div>
        `);
        this.orders_container.append(this.orders_section);

        this.orders_list = this.orders_section.find('.active-orders-list');
    }

    setup_cart_events() {
        this.cart_actions.find('.btn-clear').on('click', () => this.clear_cart());
        this.cart_actions.find('.btn-send-kitchen').on('click', () => this.send_to_kitchen());
        this.cart_actions.find('.btn-payment').on('click', () => this.proceed_to_payment());
        this.cart_header.find('.select-table-btn').on('click', () => this.open_table_selector());
    }

    // Utility function for formatting currency
    format_currency(value) {
        return "$" + parseFloat(value || 0).toFixed(2);
    }

    load_data() {
        // Show a loading state
        this.show_loading('Loading menu...');

        // Try to load real data from the API
        frappe.call({
            method: 'restaurant_pos.api.get_menu_data',
            callback: (r) => {
                this.hide_loading();
                if (!r.exc && r.message) {
                    this.render_categories(r.message.categories || []);
                    this.render_menu_items(r.message.items || []);
                    this.load_active_orders();
                } else {
                    // Fallback to sample data for testing
                    this.render_sample_data();
                    frappe.show_alert({
                        message: 'Using sample data for testing. API not available.',
                        indicator: 'orange'
                    });
                }
            },
            error: () => {
                this.hide_loading();
                // Fallback to sample data for testing
                this.render_sample_data();
                frappe.show_alert({
                    message: 'Using sample data for testing. API not available.',
                    indicator: 'orange'
                });
            }
        });
    }

    load_active_orders() {
        frappe.call({
            method: 'restaurant_pos.api.get_active_orders',
            callback: (r) => {
                if (!r.exc && r.message) {
                    this.active_orders = r.message;
                    this.update_orders_view();
                    this.updateMobileBadges();
                }
            }
        });
    }

    show_loading(message) {
        if (!this.loading_indicator) {
            this.loading_indicator = $(`
                <div class="pos-loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message || 'Loading...'}</div>
                </div>
            `);
            $('body').append(this.loading_indicator);
        } else {
            this.loading_indicator.find('.loading-message').text(message || 'Loading...');
            this.loading_indicator.show();
        }
    }

    hide_loading() {
        if (this.loading_indicator) {
            this.loading_indicator.hide();
        }
    }

    render_sample_data() {
        // Sample data for testing
        const categories = [
            { id: 'all', name: 'All Items' },
            { id: 'appetizers', name: 'Appetizers' },
            { id: 'main', name: 'Main Course' },
            { id: 'desserts', name: 'Desserts' },
            { id: 'drinks', name: 'Drinks' }
        ];

        const items = [
            { id: 'item1', name: 'French Fries', category: 'appetizers', price: 5.99, image: '', isVeg: true },
            { id: 'item2', name: 'Chicken Wings', category: 'appetizers', price: 8.99, image: '', isVeg: false },
            { id: 'item3', name: 'Burger', category: 'main', price: 12.99, image: '', isVeg: false },
            { id: 'item4', name: 'Pizza', category: 'main', price: 14.99, image: '', isVeg: true },
            { id: 'item5', name: 'Ice Cream', category: 'desserts', price: 6.99, image: '', isVeg: true },
            { id: 'item6', name: 'Soda', category: 'drinks', price: 2.99, image: '', isVeg: true }
        ];

        // Sample active orders
        const orders = [
            {
                id: 'ORD-001',
                table: 'T-001',
                timestamp: new Date(),
                total: 21.98,
                status: 'New',
                items: [
                    { id: 'item1', name: 'French Fries', quantity: 2, price: 5.99 },
                    { id: 'item2', name: 'Chicken Wings', quantity: 1, price: 8.99 }
                ]
            },
            {
                id: 'ORD-002',
                table: 'T-003',
                timestamp: new Date(),
                total: 14.99,
                status: 'In Progress',
                items: [
                    { id: 'item4', name: 'Pizza', quantity: 1, price: 14.99 }
                ]
            }
        ];

        this.render_categories(categories);
        this.render_menu_items(items);

        // Set sample active orders
        this.active_orders = orders;
        this.update_orders_view();
        this.updateMobileBadges();
    }

    render_categories(categories) {
        this.categories = categories || [];
        this.category_selector.empty();

        // Create a scrollable horizontal container for categories
        const category_container = $('<div class="category-scroll-container"></div>');
        this.category_selector.append(category_container);

        this.categories.forEach(category => {
            const btn = $(`<button class="category-btn" data-id="${category.id}">${category.name}</button>`);
            category_container.append(btn);

            btn.on('click', () => {
                this.category_selector.find('.category-btn').removeClass('selected');
                btn.addClass('selected');
                this.state.currentCategory = category.id;
                this.filter_items(category.id);
            });
        });

        // Select "All" by default
        this.state.currentCategory = 'all';
        this.category_selector.find(`.category-btn[data-id="all"]`).addClass('selected');
    }

    render_menu_items(items) {
        this.menu_items = items || [];
        this.menu_items_grid.empty();

        this.menu_items.forEach(item => {
            // Create vegetarian indicator
            const vegIndicator = item.isVeg
                ? '<div class="item-veg-indicator veg">🥬</div>'
                : '<div class="item-veg-indicator non-veg">🍖</div>';

            let item_html = `
                <div class="menu-item" data-id="${item.id}" data-category="${item.category}">
                    ${vegIndicator}
                    ${item.image ?
                    `<div class="item-image"><img src="${item.image}" alt="${item.name}"></div>` :
                    '<div class="item-image"></div>'
                }
                    <div class="item-info">
                        <h4 class="item-name">${item.name}</h4>
                        <p class="item-price">${this.format_currency(item.price)}</p>
                    </div>
                </div>
            `;

            const menuItem = $(item_html);
            this.menu_items_grid.append(menuItem);

            // Use appropriate events for different devices
            if (this.is_mobile || this.is_tablet) {
                menuItem.on('touchstart', () => {
                    this.add_to_cart(item);
                    // Add a visual feedback
                    menuItem.addClass('item-touched');
                    setTimeout(() => menuItem.removeClass('item-touched'), 150);
                });
            } else {
                menuItem.on('click', () => {
                    this.add_to_cart(item);
                });
            }
        });
    }

    filter_items(categoryId) {
        if (!this.state.isSearchActive) {
            if (categoryId === 'all') {
                this.menu_items_grid.find('.menu-item').show();
            } else {
                this.menu_items_grid.find('.menu-item').hide();
                this.menu_items_grid.find(`.menu-item[data-category="${categoryId}"]`).show();
            }
        }
    }

    add_to_cart(item) {
        // Check if item already exists in cart
        const existingItem = this.cart_items_data.find(i => i.id === item.id);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.cart_items_data.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1,
                notes: ''
            });
        }

        // Render cart and update badges
        this.render_cart();
        this.updateMobileBadges();

        // Show feedback
        frappe.show_alert({
            message: `${item.name} added to cart`,
            indicator: 'green'
        }, 1);
    }

    render_cart() {
        this.cart_items.empty();

        if (this.cart_items_data.length === 0) {
            this.cart_items.html('<div class="empty-cart"><div class="empty-cart-icon">🛒</div>Cart is empty</div>');
            this.update_cart_summary();
            // Ensure FAB is correctly handled by updateMobileBadges if on menu tab
            if (this.is_mobile && this.state.activeTab === 'menu') {
                this.updateMobileBadges();
            }
            return;
        }

        this.cart_items_data.forEach((item, index) => {
            const cartItem = $(`
                <div class="cart-item">
                    <div class="item-details">
                        <span class="item-name">${item.name}</span>
                        <div class="item-controls">
                            <button class="btn-decrease">-</button>
                            <span class="item-quantity">${item.quantity}</span>
                            <button class="btn-increase">+</button>
                        </div>
                        <span class="item-price">${this.format_currency(item.price * item.quantity)}</span>
                    </div>
                    <div class="item-notes">
                        <input type="text" placeholder="Add notes..." value="${item.notes || ''}">
                    </div>
                </div>
            `);

            this.cart_items.append(cartItem);

            // Setup event handlers
            cartItem.find('.btn-decrease').on('click', () => {
                if (item.quantity > 1) {
                    item.quantity -= 1;
                } else {
                    this.cart_items_data.splice(index, 1);
                }
                this.render_cart();
                this.updateMobileBadges();
            });

            cartItem.find('.btn-increase').on('click', () => {
                item.quantity += 1;
                this.render_cart();
                this.updateMobileBadges();
            });

            cartItem.find('input').on('change', (e) => {
                item.notes = $(e.target).val();
            });
        });

        // Update summary
        this.update_cart_summary();
    }

    update_cart_summary() {
        const subtotal = this.cart_items_data.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxRate = 0.1; // 10%
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;

        this.cart_summary.find('.subtotal-value').text(this.format_currency(subtotal));
        this.cart_summary.find('.tax-value').text(this.format_currency(taxAmount));
        this.cart_summary.find('.total-value').text(this.format_currency(total));
    }

    clear_cart() {
        if (this.cart_items_data.length === 0) return;

        frappe.confirm(
            'Are you sure you want to clear the cart?',
            () => {
                this.cart_items_data = [];
                this.render_cart(); // This will update summary
                // this.updateMobileBadges(); // updateMobileBadges will handle FAB if on menu tab

                // Explicitly manage FAB removal here if on menu tab, or rely on updateMobileBadges
                if (this.is_mobile && this.cart_floating_button) {
                     if (this.state.activeTab === 'menu') { // Only remove if on menu tab, otherwise it should already be gone
                        this.cart_floating_button.remove();
                        this.cart_floating_button = null;
                     }
                }
                this.updateMobileBadges(); // Call this after cart is empty to update all badges

                frappe.show_alert({
                    message: 'Cart cleared',
                    indicator: 'green'
                }, 1);
            }
        );
    }

    open_table_selector() {
        // First try to get tables from the server
        frappe.call({
            method: 'restaurant_pos.api.get_tables',
            callback: (r) => {
                if (!r.exc && r.message) {
                    this.show_table_selector_dialog(r.message);
                } else {
                    // Fallback to sample data
                    this.show_table_selector_dialog([
                        { name: 'T-001', table_name: 'Table 1', capacity: 8, status: 'Available' },
                        { name: 'T-002', table_name: 'Table 2', capacity: 4, status: 'Available' },
                        { name: 'T-003', table_name: 'Table 3', capacity: 4, status: 'Available' },
                        { name: 'T-004', table_name: 'Table 4', capacity: 6, status: 'Occupied' }
                    ]);
                }
            },
            error: () => {
                // Fallback to sample data on error
                this.show_table_selector_dialog([
                    { name: 'T-001', table_name: 'Table 1', capacity: 8, status: 'Available' },
                    { name: 'T-002', table_name: 'Table 2', capacity: 4, status: 'Available' },
                    { name: 'T-003', table_name: 'Table 3', capacity: 4, status: 'Available' },
                    { name: 'T-004', table_name: 'Table 4', capacity: 6, status: 'Occupied' }
                ]);
            }
        });
    }

    show_table_selector_dialog(tables) {
        // Create a visual table layout for selection with improved design
        let table_html = `
            <div class="table-layout-container">
                <div class="table-filter">
                    <input type="text" class="form-control table-search" placeholder="Search tables...">
                    <select class="form-control table-filter-status">
                        <option value="all">All Tables</option>
                        <option value="available">Available Only</option>
                        <option value="occupied">Occupied Only</option>
                    </select>
                </div>
                <div class="table-layout">
        `;

        tables.forEach(t => {
            const status_class = t.status ? t.status.toLowerCase().replace(' ', '-') : 'available';
            table_html += `
                <div class="table-item ${status_class}" data-table="${t.name}" data-capacity="${t.capacity || 0}">
                    <div class="table-status-indicator"></div>
                    <div class="table-inner">
                        <div class="table-number">${t.name}</div>
                        <div class="table-info">
                            <div class="table-capacity">
                                <span class="capacity-icon">👤</span> ${t.capacity || 0} seats
                            </div>
                            <div class="table-status">${t.status || 'Available'}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        table_html += `
                </div>
            </div>
        `;

        const d = new frappe.ui.Dialog({
            title: 'Select Table',
            fields: [
                {
                    fieldname: 'table_layout',
                    fieldtype: 'HTML',
                    options: table_html
                },
                {
                    fieldname: 'selected_table',
                    fieldtype: 'Data',
                    label: 'Selected Table',
                    read_only: 1
                }
            ],
            primary_action_label: 'Select',
            primary_action: (values) => {
                if (!values.selected_table) {
                    frappe.throw('Please select a table first');
                    return;
                }

                this.selected_table = values.selected_table;
                this.cart_header.find('.table-selector').html(`
                    <div class="table-info">
                        Table: ${this.selected_table}
                        <button class="btn btn-xs btn-change-table">Change</button>
                    </div>
                `);

                this.cart_header.find('.btn-change-table').on('click', () => this.open_table_selector());

                d.hide();
            }
        });

        // Add search functionality
        d.$wrapper.find('.table-search').on('input', function () {
            const searchTerm = $(this).val().toLowerCase();
            d.$wrapper.find('.table-item').each(function () {
                const tableName = $(this).data('table').toLowerCase();
                const tableText = $(this).text().toLowerCase();
                if (tableName.includes(searchTerm) || tableText.includes(searchTerm)) {
                    $(this).show();
                } else {
                    $(this).hide();
                }
            });
        });

        // Add filter functionality
        d.$wrapper.find('.table-filter-status').on('change', function () {
            const status = $(this).val();
            if (status === 'all') {
                d.$wrapper.find('.table-item').show();
            } else {
                d.$wrapper.find('.table-item').hide();
                d.$wrapper.find(`.table-item.${status}`).show();
            }
        });

        // Add touch events to table items
        d.$wrapper.find('.table-item').on('click', function () {
            if (!$(this).hasClass('occupied')) {
                d.$wrapper.find('.table-item').removeClass('selected');
                $(this).addClass('selected');
                d.set_value('selected_table', $(this).data('table'));
            }
        });

        d.show();

        // Make dialog responsive
        d.$wrapper.find('.modal-dialog').css({
            'width': '90%',
            'max-width': '700px'
        });
    }

    send_to_kitchen() {
        if (!this.selected_table) {
            frappe.throw('Please select a table first');
            return;
        }

        if (this.cart_items_data.length === 0) {
            frappe.throw('Cart is empty');
            return;
        }

        this.show_loading('Sending order to kitchen...');

        // Check if this table already has an active order
        const existingOrder = this.active_orders.find(order => order.table === this.selected_table);
        if (existingOrder) {
            frappe.confirm(
                `Table ${this.selected_table} already has an active order. Add these items to the existing order?`,
                () => {
                    // Add items to existing order
                    this.cart_items_data.forEach(item => {
                        const existingItem = existingOrder.items.find(i => i.id === item.id);
                        if (existingItem) {
                            existingItem.quantity += item.quantity;
                        } else {
                            existingOrder.items.push(JSON.parse(JSON.stringify(item)));
                        }
                    });

                    // Update total
                    existingOrder.total = this.calculate_order_total(existingOrder.items);

                    // Send updated order to kitchen
                    this.send_order_to_server(existingOrder);
                },
                () => {
                    this.hide_loading();
                }
            );
            return;
        }

        // Create new order
        const newOrder = {
            id: 'ORD-' + new Date().getTime(),
            table: this.selected_table,
            items: JSON.parse(JSON.stringify(this.cart_items_data)),
            total: this.get_total(),
            timestamp: new Date(),
            status: 'New'
        };

        // Add to active orders
        this.active_orders.push(newOrder);

        // Send to server
        this.send_order_to_server(newOrder);
    }

    send_order_to_server(order) {
        // Try to send order to the server
        frappe.call({
            method: 'restaurant_pos.api.create_order',
            args: {
                table: order.table,
                items: order.items,
                total: order.total
            },
            callback: (r) => {
                this.hide_loading();
                if (!r.exc) {
                    if (r.message) {
                        order.id = r.message; // Update with server-generated ID
                    }
                    frappe.show_alert({
                        message: 'Order sent to kitchen',
                        indicator: 'green'
                    });

                    // Clear cart but keep order active
                    this.cart_items_data = [];
                    this.render_cart();
                    this.update_orders_view();
                    this.updateMobileBadges();
                } else {
                    // For testing without API
                    frappe.show_alert({
                        message: 'Order sent to kitchen (simulated)',
                        indicator: 'green'
                    });

                    // Clear cart but keep order active
                    this.cart_items_data = [];
                    this.render_cart();
                    this.update_orders_view();
                    this.updateMobileBadges();
                }
            },
            error: () => {
                this.hide_loading();
                // For testing without API
                frappe.show_alert({
                    message: 'Order sent to kitchen (simulated)',
                    indicator: 'green'
                });

                // Clear cart but keep order active
                this.cart_items_data = [];
                this.render_cart();
                this.update_orders_view();
                this.updateMobileBadges();
            }
        });
    }

    calculate_order_total(items) {
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxRate = 0.1; // 10%
        const taxAmount = subtotal * taxRate;
        return subtotal + taxAmount;
    }

    update_orders_view() {
        this.orders_list.empty();

        if (this.active_orders.length === 0) {
            this.orders_list.html('<div class="empty-orders"><div class="empty-orders-icon">📋</div>No active orders</div>');
            return;
        }

        // Sort orders by table number
        this.active_orders.sort((a, b) => a.table.localeCompare(b.table));

        this.active_orders.forEach(order => {
            // Count total items
            const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

            const orderItem = $(`
                <div class="order-item" data-id="${order.id}">
                    <div class="status-indicator ${order.status.toLowerCase()}"></div>
                    <div class="order-header">
                        <span class="order-table">Table: ${order.table}</span>
                        <span class="order-time">${order.timestamp instanceof Date ?
                    order.timestamp.toLocaleTimeString() :
                    new Date(order.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="order-summary">
                        <span>${totalItems} items</span>
                        <span class="order-amount">${this.format_currency(order.total)}</span>
                    </div>
                    <div class="order-actions">
                        <button class="btn btn-order-edit">
                            <span class="btn-icon">✏️</span>
                            <span class="btn-text">Edit</span>
                        </button>
                        <button class="btn btn-order-pay">
                            <span class="btn-icon">💳</span>
                            <span class="btn-text">Pay</span>
                        </button>
                    </div>
                </div>
            `);

            this.orders_list.append(orderItem);

            // Setup event handlers
            orderItem.find('.btn-order-edit').on('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent click event
                this.load_order_to_cart(order);
            });

            orderItem.find('.btn-order-pay').on('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent click event
                this.load_order_to_cart(order);
                this.proceed_to_payment();
            });

            // Make entire order item clickable to show details
            orderItem.on('click', (e) => {
                // Don't trigger if clicking on a button
                if (!$(e.target).closest('.btn').length) {
                    this.show_order_details(order);
                }
            });
        });
    }

    load_order_to_cart(order) {
        // Ask for confirmation if there are items in the cart
        if (this.cart_items_data.length > 0) {
            frappe.confirm(
                'This will replace your current cart items. Continue?',
                () => {
                    // Clear cart and load order items
                    this.cart_items_data = JSON.parse(JSON.stringify(order.items));
                    this.selected_table = order.table;
                    this.active_order_id = order.id;

                    // Update cart UI
                    this.render_cart();
                    this.updateMobileBadges();
                    this.cart_header.find('.table-selector').html(`
                        <div class="table-info">
                            Table: ${this.selected_table}
                            <button class="btn btn-xs btn-change-table">Change</button>
                        </div>
                    `);
                    this.cart_header.find('.btn-change-table').on('click', () => this.open_table_selector());

                    // Switch to cart tab on mobile
                    if (this.is_mobile) {
                        this.setActiveTab('cart');
                    }
                }
            );
        } else {
            // Just load the order items
            this.cart_items_data = JSON.parse(JSON.stringify(order.items));
            this.selected_table = order.table;
            this.active_order_id = order.id;

            // Update cart UI
            this.render_cart();
            this.updateMobileBadges();
            this.cart_header.find('.table-selector').html(`
                <div class="table-info">
                    Table: ${this.selected_table}
                    <button class="btn btn-xs btn-change-table">Change</button>
                </div>
            `);
            this.cart_header.find('.btn-change-table').on('click', () => this.open_table_selector());

            // Switch to cart tab on mobile
            if (this.is_mobile) {
                this.setActiveTab('cart');
            }
        }
    }

    show_order_details(order) {
        // Create a list of items HTML
        let itemsHtml = '<div class="order-detail-items">';
        order.items.forEach(item => {
            itemsHtml += `
                <div class="order-detail-item">
                    <div class="item-detail-row">
                        <span class="item-name">${item.name}</span>
                        <span class="item-qty">x ${item.quantity}</span>
                        <span class="item-price">${this.format_currency(item.price * item.quantity)}</span>
                    </div>
                    ${item.notes ? `<div class="item-notes">Note: ${item.notes}</div>` : ''}
                </div>
            `;
        });
        itemsHtml += '</div>';

        const d = new frappe.ui.Dialog({
            title: `Order Details - Table ${order.table}`,
            fields: [
                {
                    fieldname: 'order_info',
                    fieldtype: 'HTML',
                    options: `
                        <div class="order-info-section">
                            <div class="info-row">
                                <strong>Table:</strong> ${order.table}
                            </div>
                            <div class="info-row">
                                <strong>Order Time:</strong> ${order.timestamp instanceof Date ?
                            order.timestamp.toLocaleString() :
                            new Date(order.timestamp).toLocaleString()}
                            </div>
                            <div class="info-row">
                                <strong>Status:</strong> ${order.status}
                            </div>
                        </div>
                    `
                },
                {
                    fieldname: 'items',
                    fieldtype: 'HTML',
                    label: 'Items',
                    options: itemsHtml
                },
                {
                    fieldname: 'total_section',
                    fieldtype: 'HTML',
                    options: `
                        <div class="order-total-section">
                            <div class="total-row">
                                <strong>Total: ${this.format_currency(order.total)}</strong>
                            </div>
                        </div>
                    `
                }
            ]
        });

        // Add action buttons
        d.set_primary_action('Load Order', () => {
            d.hide();
            this.load_order_to_cart(order);
        });

        d.add_custom_action('Pay Now', () => {
            d.hide();
            this.load_order_to_cart(order);
            this.proceed_to_payment();
        }, 'btn-primary');

        d.show();

        // Make dialog responsive
        d.$wrapper.find('.modal-dialog').css({
            'width': '90%',
            'max-width': '600px'
        });
    }

    get_total() {
        const subtotal = this.cart_items_data.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxRate = 0.1; // 10%
        const taxAmount = subtotal * taxRate;
        return subtotal + taxAmount;
    }

    proceed_to_payment() {
        if (this.cart_items_data.length === 0) {
            frappe.throw('Cart is empty');
            return;
        }

        const total = this.get_total();
        const subtotal = total / 1.1;
        const tax = total - subtotal;

        // Create payment methods HTML
        let paymentMethodsHtml = `
            <div class="payment-methods">
                <div class="payment-method-item active" data-method="Cash">
                    <div class="payment-method-icon">💵</div>
                    <div class="payment-method-name">Cash</div>
                </div>
                <div class="payment-method-item" data-method="Credit Card">
                    <div class="payment-method-icon">💳</div>
                    <div class="payment-method-name">Credit Card</div>
                </div>
                <div class="payment-method-item" data-method="Debit Card">
                    <div class="payment-method-icon">💳</div>
                    <div class="payment-method-name">Debit Card</div>
                </div>
                <div class="payment-method-item" data-method="Mobile Payment">
                    <div class="payment-method-icon">📱</div>
                    <div class="payment-method-name">Mobile</div>
                </div>
            </div>
        `;

        // Create a modern payment dialog with improved design
        const d = new frappe.ui.Dialog({
            title: 'Complete Payment',
            fields: [
                {
                    fieldname: 'payment_methods',
                    fieldtype: 'HTML',
                    options: paymentMethodsHtml
                },
                {
                    fieldname: 'order_summary',
                    fieldtype: 'HTML',
                    options: `
                        <div class="payment-summary">
                            <h4>Order Summary</h4>
                            <div class="payment-row">
                                <span>Subtotal:</span>
                                <span>${this.format_currency(subtotal)}</span>
                            </div>
                            <div class="payment-row">
                                <span>Tax (10%):</span>
                                <span>${this.format_currency(tax)}</span>
                            </div>
                            <div class="payment-row payment-total">
                                <span><strong>Total:</strong></span>
                                <span><strong>${this.format_currency(total)}</strong></span>
                            </div>
                        </div>
                    `
                },
                {
                    fieldname: 'payment_method',
                    fieldtype: 'Data',
                    label: 'Payment Method',
                    default: 'Cash',
                    hidden: 1
                },
                {
                    fieldname: 'amount_section',
                    fieldtype: 'Section Break',
                    label: 'Amount',
                    depends_on: "eval:doc.payment_method == 'Cash'"
                },
                {
                    fieldname: 'amount_paid',
                    fieldtype: 'Currency',
                    label: 'Amount Paid',
                    default: total,
                    depends_on: "eval:doc.payment_method == 'Cash'"
                },
                {
                    fieldname: 'change',
                    fieldtype: 'Currency',
                    label: 'Change',
                    default: 0,
                    read_only: 1,
                    depends_on: "eval:doc.payment_method == 'Cash'"
                },
                {
                    fieldname: 'tip_section',
                    fieldtype: 'Section Break',
                    label: 'Tip'
                },
                {
                    fieldname: 'tip_amount',
                    fieldtype: 'Currency',
                    label: 'Tip Amount (Optional)',
                    default: 0
                }
            ],
            primary_action_label: 'Complete Payment',
            primary_action: (values) => {
                this.process_payment(values, total);
                d.hide();
            }
        });

        // Payment method selection
        d.$wrapper.find('.payment-method-item').on('click', function () {
            d.$wrapper.find('.payment-method-item').removeClass('active');
            $(this).addClass('active');
            const method = $(this).data('method');
            d.set_value('payment_method', method);
        });

        // Calculate change when amount paid changes
        d.fields_dict.amount_paid.df.onchange = function () {
            const amount_paid = d.get_value('amount_paid') || 0;
            const change = Math.max(0, amount_paid - total);
            d.set_value('change', change);
        };

        // Add quick tip buttons for common tip amounts
        const tipButtonsHtml = `
            <div class="tip-buttons">
                <label>Quick Tip:</label>
                <button type="button" class="btn btn-sm tip-btn" data-tip="0">No Tip</button>
                <button type="button" class="btn btn-sm tip-btn" data-tip="10">10%</button>
                <button type="button" class="btn btn-sm tip-btn" data-tip="15">15%</button>
                <button type="button" class="btn btn-sm tip-btn" data-tip="20">20%</button>
            </div>
        `;

        d.fields_dict.tip_amount.$wrapper.after(tipButtonsHtml);

        // Add event handlers for tip buttons
        d.$wrapper.find('.tip-btn').on('click', function () {
            const tipPercent = parseInt($(this).data('tip'));
            const tipAmount = tipPercent > 0 ? (total * tipPercent / 100) : 0;
            d.set_value('tip_amount', tipAmount);
            d.$wrapper.find('.tip-btn').removeClass('active');
            $(this).addClass('active');
        });

        // Add number pad for cash payments
        if (this.is_mobile || this.is_tablet) {
            const numpadHtml = `
                <div class="numpad">
                    <div class="numpad-btn" data-num="1">1</div>
                    <div class="numpad-btn" data-num="2">2</div>
                    <div class="numpad-btn" data-num="3">3</div>
                    <div class="numpad-btn" data-num="4">4</div>
                    <div class="numpad-btn" data-num="5">5</div>
                    <div class="numpad-btn" data-num="6">6</div>
                    <div class="numpad-btn" data-num="7">7</div>
                    <div class="numpad-btn" data-num="8">8</div>
                    <div class="numpad-btn" data-num="9">9</div>
                    <div class="numpad-btn" data-num="clear">C</div>
                    <div class="numpad-btn" data-num="0">0</div>
                    <div class="numpad-btn" data-num=".">.</div>
                </div>
            `;

            d.fields_dict.amount_paid.$wrapper.after(numpadHtml);

            // Handle numpad input
            d.$wrapper.find('.numpad-btn').on('click', function () {
                const num = $(this).data('num');
                let currentVal = d.get_value('amount_paid') || '';

                if (num === 'clear') {
                    d.set_value('amount_paid', '');
                } else {
                    // Handle decimal point
                    if (num === '.' && currentVal.toString().includes('.')) {
                        return;
                    }

                    // Append digit or decimal
                    if (currentVal === '') {
                        if (num === '.') {
                            d.set_value('amount_paid', '0.');
                        } else {
                            d.set_value('amount_paid', num);
                        }
                    } else {
                        d.set_value('amount_paid', currentVal.toString() + num);
                    }
                }
            });
        }

        d.show();

        // Make dialog responsive
        d.$wrapper.find('.modal-dialog').css({
            'width': '90%',
            'max-width': '600px'
        });
    }

    process_payment(values, total) {
        const finalAmount = total + (values.tip_amount || 0);

        this.show_loading('Processing payment...');

        // Process payment
        frappe.call({
            method: 'restaurant_pos.api.process_payment',
            args: {
                payment_method: values.payment_method,
                amount_paid: values.amount_paid || finalAmount,
                amount_due: finalAmount,
                tip_amount: values.tip_amount || 0,
                items: this.cart_items_data,
                table: this.selected_table
            },
            callback: (r) => {
                this.hide_loading();
                if (!r.exc) {
                    frappe.show_alert({
                        message: 'Payment completed successfully',
                        indicator: 'green'
                    });

                    // Show receipt options
                    this.show_receipt_options(r.message);

                } else {
                    // For testing without API
                    frappe.show_alert({
                        message: 'Payment completed successfully (simulated)',
                        indicator: 'green'
                    });

                    this.complete_payment();
                }
            },
            error: () => {
                this.hide_loading();
                // For testing without API
                frappe.show_alert({
                    message: 'Payment completed successfully (simulated)',
                    indicator: 'green'
                });

                this.complete_payment();
            }
        });
    }

    complete_payment() {
        // Remove from active orders if it was an existing order
        if (this.active_order_id) {
            this.active_orders = this.active_orders.filter(o => o.id !== this.active_order_id);
            this.update_orders_view();
        }

        // Clear cart and reset
        this.cart_items_data = [];
        this.render_cart();
        this.active_order_id = null;
        this.updateMobileBadges();

        // Reset table selection
        this.selected_table = null;
        this.cart_header.find('.table-selector').html('<button class="btn btn-default select-table-btn">Select Table</button>');
        this.cart_header.find('.select-table-btn').on('click', () => this.open_table_selector());
    }

    show_receipt_options(receipt_data) {
        const d = new frappe.ui.Dialog({
            title: 'Payment Complete',
            fields: [
                {
                    fieldname: 'confirmation',
                    fieldtype: 'HTML',
                    options: `
                        <div class="payment-confirmation">
                            <div class="success-icon">✅</div>
                            <h4>Payment Successful!</h4>
                            <p>Your payment has been processed successfully.</p>
                        </div>
                    `
                }
            ]
        });

        d.set_primary_action('Print Receipt', () => {
            this.print_receipt(receipt_data);
            d.hide();
            this.complete_payment();
        });

        d.add_custom_action('Email Receipt', () => {
            this.email_receipt(receipt_data);
            d.hide();
            this.complete_payment();
        }, 'btn-default');

        d.add_custom_action('No Receipt', () => {
            d.hide();
            this.complete_payment();
        }, 'btn-default');

        d.show();

        // Auto close after 5 seconds if no action
        setTimeout(() => {
            if (d.is_visible) {
                d.hide();
                this.complete_payment();
            }
        }, 5000);
    }

    print_receipt(receipt_data) {
        frappe.call({
            method: 'frappe.www.printview.get_html_and_style',
            args: {
                doc: receipt_data,
                print_format: 'POS Receipt',
                no_letterhead: 1
            },
            callback: function (r) {
                if (!r.exc) {
                    frappe.printing.print_html(r.message.html, r.message.style);
                }
            }
        });
    }

    email_receipt(receipt_data) {
        frappe.prompt({
            fieldname: 'email',
            fieldtype: 'Data',
            label: 'Email Address',
            reqd: 1
        }, (values) => {
            frappe.call({
                method: 'restaurant_pos.api.email_receipt',
                args: {
                    email: values.email,
                    receipt_data: receipt_data
                },
                callback: (r) => {
                    if (!r.exc) {
                        frappe.show_alert({
                            message: 'Receipt sent successfully',
                            indicator: 'green'
                        });
                    }
                }
            });
        }, 'Send Receipt');
    }

    // Utility methods
    sync_data() {
        this.show_loading('Syncing data...');

        // Refresh data
        frappe.call({
            method: 'restaurant_pos.api.sync_pos_data',
            callback: (r) => {
                // Reload all data
                this.load_data();

                setTimeout(() => {
                    this.hide_loading();
                    frappe.show_alert({
                        message: 'Data synchronized successfully',
                        indicator: 'green'
                    });
                }, 1000);
            },
            error: () => {
                // Even on error, try to reload local data
                this.load_data();

                setTimeout(() => {
                    this.hide_loading();
                    frappe.show_alert({
                        message: 'Sync completed with warnings',
                        indicator: 'orange'
                    });
                }, 1000);
            }
        });
    }

    open_settings() {
        frappe.set_route('Form', 'POS Settings');
    }

    create_new_order() {
        if (this.cart_items_data.length > 0) {
            frappe.confirm(
                'This will clear your current cart. Continue?',
                () => {
                    this.cart_items_data = [];
                    this.render_cart();
                    this.selected_table = null;
                    this.cart_header.find('.table-selector').html('<button class="btn btn-default select-table-btn">Select Table</button>');
                    this.cart_header.find('.select-table-btn').on('click', () => this.open_table_selector());
                    this.updateMobileBadges();

                    // Go to menu tab on mobile
                    if (this.is_mobile) {
                        this.setActiveTab('menu');
                    }

                    frappe.show_alert({
                        message: 'New order started',
                        indicator: 'green'
                    });
                }
            );
        } else {
            // If cart is already empty, just reset everything
            this.selected_table = null;
            this.cart_header.find('.table-selector').html('<button class="btn btn-default select-table-btn">Select Table</button>');
            this.cart_header.find('.select-table-btn').on('click', () => this.open_table_selector());

            // Go to menu tab on mobile
            if (this.is_mobile) {
                this.setActiveTab('menu');
            }

            frappe.show_alert({
                message: 'New order started',
                indicator: 'green'
            });
        }
    }

    view_tables() {
        frappe.set_route('List', 'Restaurant Table');
    }

    view_kitchen_display() {
        frappe.set_route('List', 'Kitchen Order Ticket');
    }

    toggle_orders_view() {
        // For mobile - toggle between orders view
        if (this.is_mobile) {
            this.setActiveTab('orders');
        }
    }
};

// Initialize the POS page
frappe.pages['restaurant-pos'].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Restaurant POS',
        single_column: true
    });

    // Load CSS
    frappe.require('/assets/restaurant_pos/css/pos_view.css');

    // Initialize the POS View
    wrapper.pos = new restaurant_pos.point_of_sale.PosView(wrapper);
};

frappe.pages['restaurant-pos'].refresh = function (wrapper) {
    // Refresh data when page is refreshed
    if (wrapper.pos) {
        wrapper.pos.load_data();
    }
};