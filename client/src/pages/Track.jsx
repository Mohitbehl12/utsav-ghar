import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, PAYMENT_LABEL, STATUS_LABEL, tone } from '../lib/format.js';
import { Field, Pill, useSeo } from '../components/ui.jsx';
import { DeliveryInfo, Timeline, OrderTotals } from './Order.jsx';

export default function Track() {
  const [sp] = useSearchParams();
  const [num, setNum] = useState(sp.get('order') || '');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState(null);
  const [state, setState] = useState({});
  useSeo({ title: 'Track Your Order | Utsav Ghar' });
  useEffect(() => { if (sp.get('order')) document.getElementById('tr-phone')?.focus(); }, [sp]);

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try { setOrder(await api.post('/orders/track', { orderNumber: num.trim(), phone: phone.trim() })); setState({}); }
    catch (err) { setOrder(null); setState({ err: err.message }); }
  };

  return (
    <div className="container narrow track">
      <h1>Track Your Order</h1>
      <p className="muted">Enter your order ID and the mobile number used at checkout.</p>
      <form className="card form track__form" onSubmit={submit}>
        <Field label="Order ID" id="tr-num"><input id="tr-num" value={num} onChange={(e) => setNum(e.target.value)} placeholder="DIWALI10245" required /></Field>
        <Field label="Mobile number" id="tr-phone"><input id="tr-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" required /></Field>
        <button className="btn btn--primary" disabled={state.busy}>Track</button>
        {state.err && <p className="field__error" role="alert">{state.err}</p>}
      </form>
      {order && (
        <section className="card">
          <div className="row between wrap">
            <h2>#{order.order_number}</h2>
            <div className="row gap-s"><Pill tone={tone(order.payment_status)}>{PAYMENT_LABEL[order.payment_status]}</Pill><Pill tone={tone(order.status)}>{STATUS_LABEL[order.status]}</Pill></div>
          </div>
          <p className="muted">For {order.customer.name} · {order.address.city} {order.address.pincode} · Estimated delivery {fmtDate(order.estimated_delivery)}</p>
          <Timeline order={order} />
          <DeliveryInfo order={order} />
          {order.tracking && !order.delivery?.awb && <p>Courier: <b>{order.tracking.carrier}</b> · Tracking no. <b>{order.tracking.number}</b></p>}
          <OrderTotals order={order} />
        </section>
      )}
    </div>
  );
}
