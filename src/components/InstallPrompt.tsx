import { Download, ExternalLink, X } from "lucide-react";

interface InstallPromptProps {
  canInstall: boolean;
  isIos: boolean;
  isMobile: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallPrompt({ canInstall, isIos, isMobile, onInstall, onDismiss }: InstallPromptProps) {
  if (!canInstall && !isIos && !isMobile) return null;

  const copy = isIos && !canInstall
    ? "Open Share, then choose Add to Home Screen"
    : canInstall
      ? "Keep your review space one tap away"
      : "Open the browser menu and choose Install app";

  return (
    <aside className="install-prompt" aria-label="Install Deutschly">
      <span className="install-prompt__icon" aria-hidden="true"><Download size={19} /></span>
      <span className="install-prompt__copy">
        <strong>Install Deutschly</strong>
        <small>{copy}</small>
      </span>
      {canInstall && (
        <button type="button" className="install-prompt__action" onClick={onInstall}>
          Install
        </button>
      )}
      {isIos && !canInstall && <ExternalLink className="install-prompt__ios-icon" size={17} aria-hidden="true" />}
      <button type="button" className="install-prompt__close" onClick={onDismiss} aria-label="Dismiss install suggestion">
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  );
}
