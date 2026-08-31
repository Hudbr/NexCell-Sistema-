let selectedCustomer=null;

export function getSelectedCustomer(){return selectedCustomer}

export function setSelectedCustomer(customer){
  selectedCustomer=customer?.id?{
    id:customer.id,
    full_name:String(customer.full_name||customer.name||'').trim(),
    phone:String(customer.phone||'').trim(),
    email:String(customer.email||'').trim(),
    notes:customer.notes||null,
  }:null;
  window.dispatchEvent(new CustomEvent('nexcell:customer-selected',{detail:selectedCustomer}));
  return selectedCustomer;
}

export function clearSelectedCustomer(){return setSelectedCustomer(null)}

export function onSelectedCustomerChange(callback){
  const listener=event=>callback(event.detail||null);
  window.addEventListener('nexcell:customer-selected',listener);
  callback(selectedCustomer);
  return()=>window.removeEventListener('nexcell:customer-selected',listener);
}
