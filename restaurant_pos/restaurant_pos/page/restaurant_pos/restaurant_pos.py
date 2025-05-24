# Copyright (c) 2023, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe import _

def get_context(context):
    context.title = _("Restaurant POS")