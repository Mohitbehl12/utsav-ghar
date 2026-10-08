const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const I = (paths) => function Icon(props) { return <svg {...base} {...props}>{paths}</svg>; };

export const SearchIcon = I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const HeartIcon = I(<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.1 3 4.5 6.5 4.5c2 0 3.3 1.1 4 2.2.3.5 1 .5 1.3 0 .7-1.1 2-2.2 4-2.2 3.5 0 5.3 3.6 3.7 6.9C19 15.6 12 20 12 20z" />);
export const ShareIcon = I(<><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>);
export const BagIcon = I(<><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>);
export const UserIcon = I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
export const MenuIcon = I(<path d="M4 7h16M4 12h16M4 17h16" />);
export const HomeIcon = I(<><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>);
export const GridIcon = I(<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>);
export const TagIcon = I(<><path d="M3 12V4h8l9 9-8 8-9-9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>);
export const BackIcon = I(<path d="M15 5 8 12l7 7" />);
export const CloseIcon = I(<path d="M6 6l12 12M18 6 6 18" />);
export const EyeIcon = I(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const StarIcon = (p) => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...p}><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor" /></svg>;
export const TruckIcon = I(<><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>);
export const ShieldIcon = I(<><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" /></>);
export const CopyIcon = I(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>);
export const CheckIcon = I(<path d="m5 12 5 5 9-10" />);
export const ChevronIcon = I(<path d="m9 6 6 6-6 6" />);
export const FilterIcon = I(<path d="M4 6h16M7 12h10M10 18h4" />);
export const PhoneIcon = I(<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />);
export const MailIcon = I(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
export const GiftIcon = I(<><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 13h18M12 9v12M12 9C10 5 6 5 7 8c.4 1 5 1 5 1zm0 0c2-4 6-4 5-1-.4 1-5 1-5 1z" /></>);
export const SparkIcon = I(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const UploadIcon = I(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>);
export const TrashIcon = I(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
export const EditIcon = I(<path d="M4 20h4L19 9l-4-4L4 16v4z" />);
export const PlusIcon = I(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = I(<path d="M5 12h14" />);
export const LogoutIcon = I(<><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>);

export function InstagramIcon(p) { return <svg {...base} {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>; }
export function FacebookIcon(p) { return <svg {...base} {...p}><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" /></svg>; }
export function YoutubeIcon(p) { return <svg {...base} {...p}><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></svg>; }

/** Brand mark: a diya whose flame rises from a lotus base. */
export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="lm-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#E7792B" /><stop offset="1" stopColor="#FFD36B" /></linearGradient>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#B8862B" /><stop offset=".5" stopColor="#F3D48A" /><stop offset="1" stopColor="#B8862B" /></linearGradient>
      </defs>
      <path d="M24 4c5 7 7.5 11 7.5 15a7.5 7.5 0 0 1-15 0c0-4 2.5-8 7.5-15z" fill="url(#lm-f)" />
      <path d="M24 13c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7z" fill="#FFF3C8" />
      <path d="M6 30c4 0 9 2 11 6-5 1-9-1-11-6zM42 30c-4 0-9 2-11 6 5 1 9-1 11-6z" fill="url(#lm-g)" />
      <path d="M9 32h30c-1.5 7-7.5 11-15 11S10.5 39 9 32z" fill="url(#lm-g)" />
      <path d="M24 28c3 3 4 6 3 9-1 1-5 1-6 0-1-3 0-6 3-9z" fill="#B8862B" />
    </svg>
  );
}
