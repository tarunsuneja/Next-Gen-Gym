import { GYM_LOGO, GYM_LOGO_ALT, GYM_OWNER } from "./branding";

export function GymLogo({ className = "gym-logo" }: { className?: string }) {
  return <img className={className} src={GYM_LOGO} alt={GYM_LOGO_ALT} />;
}

export function Brand() {
  return (
    <>
      <GymLogo />
      <span className="brand-name">
        The Next Generation<span>Fitness Gym</span>
      </span>
      <div className="brand-unit">
        <small>
          Unit by <strong>{GYM_OWNER}</strong>
        </small>
      </div>
    </>
  );
}
