import { UserButton } from '@clerk/clerk-react';
import styles from './Header.module.css';
import { HatiLogo } from './HatiLogo';
import { ProfileIcon } from '../shared/icons';

type Props = {
  /** Opens the profile dialog. Omitted on the loading screen, where there is nothing to open it over. */
  onOpenProfile?: () => void;
};

export function Header({ onOpenProfile }: Props) {
  return (
    <header className={styles.header}>
      <HatiLogo className={styles.logo} />
      <div className={styles.titles}>
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>Track shared purchases and see who owes what.</p>
      </div>
      {/* Clerk's own menu, carrying account management and sign-out. Listing
          the two defaults after Profile fixes the order: Profile, Manage
          account, Sign out. */}
      <UserButton afterSignOutUrl="/">
        {onOpenProfile && (
          <UserButton.MenuItems>
            <UserButton.Action
              label="Profile"
              labelIcon={<ProfileIcon className={styles.menuIcon} />}
              onClick={onOpenProfile}
            />
            <UserButton.Action label="manageAccount" />
            <UserButton.Action label="signOut" />
          </UserButton.MenuItems>
        )}
      </UserButton>
    </header>
  );
}
