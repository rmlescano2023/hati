import { UserButton } from '@clerk/clerk-react';
import styles from './Header.module.css';
import { HatiLogo } from './HatiLogo';
import { ProfileIcon, TutorialsIcon } from '../shared/icons';

type Props = {
  /** Opens the profile dialog. Omitted on the loading screen, where there is nothing to open it over. */
  onOpenProfile?: () => void;
  /** Opens the Tutorials dialog. Given together with `onOpenProfile`, since both live in the menu. */
  onOpenTutorials?: () => void;
};

export function Header({ onOpenProfile, onOpenTutorials }: Props) {
  return (
    <header className={styles.header}>
      <HatiLogo className={styles.logo} />
      <div className={styles.titles}>
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>Track shared purchases and see who owes what.</p>
      </div>
      {/* Clerk's own menu, carrying account management and sign-out. Listing
          the two defaults after Profile and Tutorials fixes the order: Profile,
          Tutorials, Manage account, Sign out. */}
      <UserButton afterSignOutUrl="/">
        {onOpenProfile && onOpenTutorials && (
          <UserButton.MenuItems>
            <UserButton.Action
              label="Profile"
              labelIcon={<ProfileIcon className={styles.menuIcon} />}
              onClick={onOpenProfile}
            />
            <UserButton.Action
              label="Tutorials"
              labelIcon={<TutorialsIcon className={styles.menuIcon} />}
              onClick={onOpenTutorials}
            />
            <UserButton.Action label="manageAccount" />
            <UserButton.Action label="signOut" />
          </UserButton.MenuItems>
        )}
      </UserButton>
    </header>
  );
}
