import Image from 'next/image';
import { ReactNode } from 'react';

type ReplayTrovePageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
};

export default function ReplayTrovePageShell({
  title,
  subtitle,
  children,
  maxWidth = '1500px',
}: ReplayTrovePageShellProps) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* White logo strip */}
      <div
        style={{
          width: '100%',
          background: '#ffffff',
          borderBottom: '1px solid #e6e6e6',
        }}
      >
        <div
          style={{
            maxWidth,
            margin: '0 auto',
            padding: '26px 24px 20px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Image
            src="/logo.png"
            alt="ReplayTrove"
            width={460}
            height={140}
            style={{
              width: '100%',
              maxWidth: '420px',
              height: 'auto',
            }}
          />
        </div>
      </div>

      {/* Black info bar */}
      <div
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #111315 0%, #24272c 100%)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            maxWidth,
            margin: '0 auto',
            padding: '18px 24px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#ffffff',
              fontSize: '1.05rem',
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}
          >
            {title}
          </p>

          {subtitle ? (
            <p
              style={{
                margin: '8px 0 0',
                color: 'rgba(255,255,255,0.78)',
                fontSize: '0.95rem',
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {/* Page content */}
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          padding: '28px 24px 40px',
        }}
      >
        {children}
      </div>
    </main>
  );
}