import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, setDoc, getDoc, query, collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../services/firebase';
import { UserProfile, ArtDetails, HistoryItem, MuseumStamp } from '../types';

export function useUserStats(user: User | null, initialProfile: UserProfile | null) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initialProfile);
  const [museumStamps, setMuseumStamps] = useState<MuseumStamp[]>([]);

  useEffect(() => {
    if (initialProfile) {
      setUserProfile(initialProfile);
    }
  }, [initialProfile]);

  const addXP = async (amount: number) => {
    if (!user || !userProfile) return;
    
    const newXP = (userProfile.totalXP || 0) + amount;
    const currentLevel = userProfile.level || 1;
    const nextLevelXP = currentLevel * 100;
    const newLevel = newXP >= nextLevelXP ? currentLevel + 1 : currentLevel;
    
    const updatedProfile = {
      ...userProfile,
      totalXP: newXP,
      level: newLevel
    };
    
    setUserProfile(updatedProfile);
    try {
      await setDoc(doc(db, 'users', user.uid), sanitizeForFirestore(updatedProfile), { merge: true });
      // Sync to public profile
      await setDoc(doc(db, 'public_profiles', user.uid), sanitizeForFirestore({
        uid: user.uid,
        email: user.email,
        displayName: updatedProfile.displayName || user.displayName || user.email?.split('@')[0] || 'User',
        photoURL: updatedProfile.photoURL || user.photoURL,
        level: updatedProfile.level,
        totalXP: updatedProfile.totalXP,
        badges: updatedProfile.badges,
        isGalleryPublic: updatedProfile.isGalleryPublic,
        isBucketListPublic: updatedProfile.isBucketListPublic
      }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleMuseumCheckIn = async (stamp: MuseumStamp) => {
    if (!user) return;
    
    setMuseumStamps(prev => [stamp, ...prev]);
    const path = `users/${user.uid}/passport`;
    try {
      await setDoc(doc(db, path, stamp.id), sanitizeForFirestore({
        ...stamp,
        userId: user.uid
      }), { merge: true });
      
      // Sync to public passport if sharing is active
      if (userProfile?.isGalleryPublic || userProfile?.isBucketListPublic) {
        const publicPath = `public_passports/${user.uid}/stamps`;
        await setDoc(doc(db, publicPath, stamp.id), sanitizeForFirestore({
          ...stamp,
          userId: user.uid
        }), { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    
    // Reward XP for check-in
    addXP(200);
  };

  const fetchUserPassport = async (uid: string) => {
    const path = `users/${uid}/passport`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const stamps: MuseumStamp[] = [];
      querySnapshot.forEach((doc) => {
        stamps.push({ id: doc.id, ...doc.data() } as MuseumStamp);
      });
      setMuseumStamps(stamps);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  const updateLevelingOnScan = async (details: ArtDetails, historyLength: number) => {
    if (!user || !userProfile) return;

    const movement = details.movement || 'Unknown';
    const currentMovementScans = userProfile.scansByMovement?.[movement] || 0;
    const newMovementScans = currentMovementScans + 1;
    
    const updatedScansByMovement = {
      ...userProfile.scansByMovement,
      [movement]: newMovementScans
    };

    const newBadges = [...(userProfile.badges || [])];
    const movementBadges = [
      { id: 'impressionist-trainee', movement: 'Impressionism', threshold: 1 },
      { id: 'impressionist-expert', movement: 'Impressionism', threshold: 5 },
      { id: 'renaissance-apprentice', movement: 'Renaissance', threshold: 1 },
      { id: 'renaissance-master', movement: 'Renaissance', threshold: 5 },
      { id: 'modernist-explorer', movement: 'Modernism', threshold: 1 },
    ];

    movementBadges.forEach(b => {
      if (movement === b.movement && newMovementScans >= b.threshold && !newBadges.includes(b.id)) {
        newBadges.push(b.id);
      }
    });

    const totalScans = historyLength + 1;
    if (totalScans >= 1 && !newBadges.includes('connoisseur-initiate')) newBadges.push('connoisseur-initiate');
    if (totalScans >= 10 && !newBadges.includes('art-historian')) newBadges.push('art-historian');

    const updatedProfile: UserProfile = {
      ...userProfile,
      scansByMovement: updatedScansByMovement,
      badges: newBadges,
      totalXP: (userProfile.totalXP || 0) + 10
    };

    const currentLevel = updatedProfile.level || 1;
    if (updatedProfile.totalXP >= currentLevel * 100) {
      updatedProfile.level = currentLevel + 1;
    }

    setUserProfile(updatedProfile);
    try {
      await setDoc(doc(db, 'users', user.uid), sanitizeForFirestore(updatedProfile), { merge: true });
      await setDoc(doc(db, 'public_profiles', user.uid), sanitizeForFirestore({
        uid: user.uid,
        email: user.email,
        displayName: updatedProfile.displayName || user.displayName || user.email?.split('@')[0] || 'User',
        photoURL: updatedProfile.photoURL || user.photoURL,
        level: updatedProfile.level,
        totalXP: updatedProfile.totalXP,
        badges: updatedProfile.badges,
        isGalleryPublic: updatedProfile.isGalleryPublic,
        isBucketListPublic: updatedProfile.isBucketListPublic
      }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  return {
    userProfile,
    setUserProfile,
    museumStamps,
    setMuseumStamps,
    handleMuseumCheckIn,
    fetchUserPassport,
    addXP,
    updateLevelingOnScan
  };
}
