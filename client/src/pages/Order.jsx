import { openChat } from '../components/ChatBot.jsx';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, orderToken } from '../lib/api.js';
import { rupees, fmtDate, fmtDateTime, PAYMENT_LABEL, STATUS_LABEL, tone } from '../lib/format.js';
import { Pill, Spinner, Empty, useSeo } from '../components/ui.jsx';
import PaymentPanel from '../components/PaymentPanel.jsx';
import FestiveSky from '../components/FestiveSky.jsx';
import AfterSales from '../components/AfterSales.jsx';

export function Timeline({ order }) {
  const cancelled = order.status === 'cancelled';
  return (
    <ol className={`timeline ${cancelled ? 'is-cancelled' : ''}`}>
      {order.timeline.map((s, i) => {
        const current = !cancelled && s.done && !order.timeline[i + 1]?.done;
        return (
          <li key={s.key} className={`${s.done ? 'done' : ''} ${current ? 'current' : ''}`}>
            <span className="timeline__dot" aria-hidden="true">{s.icon}</span>
            <div>
              <b>{s.label}</b>
              <small>{s.at ? fmtDateTime(s.at) : s.key === 'payment_confirmed' && order.payment_status === 'verification_pending' ? 'Verifying your UPI payment' : 'Pending'}</small>
            </div>
          </li>
        );
      })}
      {cancelled && <li className="done current"><span className="timeline__dot">✖</span><div><b>Cancelled</b></div></li>}
    </ol>
  );
}

/** Delivery details from the dealer: rider + 4-digit code, or courier + tracking. */
export function DeliveryInfo({ order }) {
  const d = order.delivery;
  if (!d || order.status === 'cancelled') return null;
  if (d.otp) {
    return (
      <div className="dlv">
        <p className="dlv__h">🛵 Out for delivery{d.rider_name ? <> with <b>{d.rider_name}</b></> : null}</p>
        {d.rider_phone && <a className="link small" href={`tel:+91${d.rider_phone}`}>📞 Call {d.rider_phone}</a>}
        <p className="dlv__code" aria-label={`Delivery code ${d.otp.split('').join(' ')}`}>{d.otp.split('').map((x, i) => <span key={i}>{x}</span>)}</p>
        <p className="small muted">Your delivery code. Share it with the delivery person <b>only after</b> you receive the parcel.</p>
      </div>
    );
  }
  if (d.mode === 'courier' && d.awb) {
    return (
      <div className="dlv dlv--courier">
        <p className="dlv__h">📮 {d.courier_name} · AWB <b>{d.awb}</b>{d.tracking_url && <> · <a className="link" href={d.tracking_url} target="_blank" rel="noreferrer">Track parcel ↗</a></>}</p>
        {d.tracking?.length > 0 && <ul className="dlv__cp">{[...d.tracking].reverse().map((t, i) => <li key={i} className={i === 0 ? 'is-now' : ''}><b>{t.label}</b>{t.location ? ` · ${t.location}` : ''} <span className="small muted">{fmtDateTime(t.at)}</span></li>)}</ul>}
        {d.received_by && <p className="small">Received by <b>{d.received_by}</b></p>}
      </div>
    );
  }
  if (d.mode === 'self' && d.stage === 'delivered') return <p className="small">✅ Delivered{d.delivered_at ? ` on ${fmtDateTime(d.delivered_at)}` : ''} — confirmed with your code.</p>;
  return null;
}

export function OrderTotals({ order }) {
  const t = order.totals;
  return (
    <dl className="totals">
      <div><dt>Subtotal</dt><dd>{rupees(t.subtotal)}</dd></div>
      {t.discount > 0 && <div className="ok"><dt>{order.offer_name || 'Discount'}</dt><dd>−{rupees(t.discount)}</dd></div>}
      <div><dt>Delivery</dt><dd>{t.delivery ? rupees(t.delivery) : 'FREE'}</dd></div>
      <div className="totals__grand"><dt>Total</dt><dd>{rupees(t.total)}</dd></div>
    </dl>
  );
}

export default function Order() {
  const { number } = useParams();
  const [sp] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const token = orderToken(number);
  const justPlaced = sp.get('placed') === '1';
  useSeo({ title: `Order #${number} | Utsav Ghar` });

  useEffect(() => {
    api.get(`/orders/${number}`, { headers: { 'X-Order-Token': token } }).then(setOrder).catch(setErr);
  }, [number, token]);

  if (err) return <div className="container"><Empty icon="📦" title="Order not found" action={<Link to="/track" className="btn btn--primary">Track with order number &amp; phone</Link>}>Open this page on the device you ordered from, sign in, or track your order with its number and mobile number.</Empty></div>;
  if (!order) return <div className="container center pad"><Spinner /></div>;

  const needsPayment = ['awaiting_payment', 'rejected'].includes(order.payment_status) && order.status !== 'cancelled';
  return (
    <div className="order-page">
      {justPlaced && (
        <section className="thanks">
          <FestiveSky density={0.8} />
          <div className="container thanks__inner">
            <p className="thanks__burst" aria-hidden="true">🎉</p>
            <h1>Order Placed Successfully!</h1>
            <p className="thanks__name">Thank you, {order.customer.name.split(' ')[0]} ❤️</p>
            <p className="thanks__id">Order ID <b>#{order.order_number}</b></p>
            <div className="row gap-s center-x">
              <Link to={`/track?order=${order.order_number}`} className="btn btn--gold">Track Order</Link>
              <Link to="/shop" className="btn btn--ghost-light">Continue Shopping</Link>
            </div>
          </div>
        </section>
      )}
      <div className="container order">
        {!justPlaced && <h1>Order #{order.order_number}</h1>}
        <div className="order__status">
          <Pill tone={tone(order.payment_status)}>{PAYMENT_LABEL[order.payment_status]}</Pill>
          <Pill tone={tone(order.status)}>{STATUS_LABEL[order.status]}</Pill>
          <span className="muted small">Placed {fmtDateTime(order.created_at)}</span>
        </div>
        {order.payment_status === 'verification_pending' && (
          <p className="notice notice--info">⏳ We've received your payment details (UTR {order.payment?.customer_ref}). Our team verifies it against the bank statement, usually within a few hours, and then starts packing your order.</p>
        )}
        {order.payment_status === 'confirmed' && order.payment?.instrument && <p className="notice notice--ok">✅ Paid online · {order.payment.instrument}. We're preparing your order.</p>}
        {order.payment_status === 'rejected' && <p className="notice notice--warn">We couldn't match your payment. Please check the UTR and submit again, or contact us.</p>}
        {needsPayment && <div className="card"><PaymentPanel order={order} token={token} onSubmitted={setOrder} /></div>}

        <p className="order__help small">Problem with this order? <Link className="link" to={`/help?raise=1&topic=${order.payment_status === 'verification_pending' ? 'payment' : order.status === 'delivered' ? 'damaged' : 'order_status'}&order=${order.order_number}`}>Get help</Link> · <button type="button" className="link-btn link" onClick={() => openChat(`order ${order.order_number}`)}>Chat with us</button></p>
        <div className="order__grid">
          <section className="card">
            <h2>Order status</h2>
            <Timeline order={order} />
            <DeliveryInfo order={order} />
            {order.tracking && !order.delivery?.awb && <p className="small">Courier: <b>{order.tracking.carrier}</b> · Tracking no. <b>{order.tracking.number}</b></p>}
          </section>
          <section className="card">
            <h2>Items</h2>
            <ul className="mini-lines">
              {order.items.map((i) => (
                <li key={i.name}><span>{i.name} <span className="muted">× {i.qty}</span></span><b>{rupees(i.line_total)}</b></li>
              ))}
            </ul>
            <OrderTotals order={order} />
          </section>
          <section className="card">
            <h2>Delivery</h2>
            <p><b>{order.customer.name}</b>{order.customer.phone ? ` · ${order.customer.phone}` : ''}<br />{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}<br />{order.address.city}, {order.address.state} {order.address.pincode}</p>
            <p>Estimated delivery: <b>{fmtDate(order.estimated_delivery, { weekday: 'short', day: 'numeric', month: 'short' })}</b></p>
            <p className="small muted">Payment: {PAYMENT_LABEL[order.payment_status]} · UPI</p>
            {order.customer.email && <p className="small muted">A confirmation has been sent to {order.customer.email}.</p>}
          </section>
        </div>
        <AfterSales order={order} token={token} onChange={setOrder} />
      </div>
    </div>
  );
}
