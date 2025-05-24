frappe.pages['restaurant-pos'].on_page_load = function(wrapper) {
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

frappe.pages['restaurant-pos'].refresh = function(wrapper) {
    // Refresh data when page is refreshed
    if (wrapper.pos) {
        wrapper.pos.load_data();
    }
};