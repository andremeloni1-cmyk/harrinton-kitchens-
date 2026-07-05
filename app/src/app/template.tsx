// A template re-mounts on every navigation (unlike layout), so this gives each
// screen a smooth slide-up entrance as you move between pages. Motion is defined
// in globals.css (.route-fade) and disabled under prefers-reduced-motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
