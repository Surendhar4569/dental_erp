import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { branchService } from '../services/branchService';
import { toast } from 'react-toastify';

const BranchContext = createContext(null);

export const BranchProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const viewMode = 'single'; // Strict single-branch mode for all roles

  // Load authorized branches strictly from server-side assignments
  const loadBranches = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setBranches([]);
      setActiveBranch(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      // Fetch fresh branches authorized to this user from backend
      const res = await branchService.getBranches();
      const branchList = res.branches || user.branches || [];
      setBranches(branchList);

      // Resolve authorized branch:
      // Check saved branch ID only if it strictly exists in server-authorized branchList
      const savedBranchId = localStorage.getItem('dental_erp_active_branch_id');
      let targetBranch = null;

      if (savedBranchId) {
        const found = branchList.find((b) => b.id === savedBranchId && b.is_active);
        if (found) {
          targetBranch = found;
        }
      }

      // If no valid saved branch in authorized list, use user's assigned default or first assigned active branch
      if (!targetBranch) {
        targetBranch =
          branchList.find((b) => b.is_user_default && b.is_active) ||
          branchList.find((b) => b.is_default && b.is_active) ||
          branchList.find((b) => b.is_active) ||
          branchList[0] ||
          null;
      }

      if (targetBranch) {
        setActiveBranch(targetBranch);
        localStorage.setItem('dental_erp_active_branch_id', targetBranch.id);
      } else {
        setActiveBranch(null);
        localStorage.removeItem('dental_erp_active_branch_id');
      }
    } catch (err) {
      console.warn('Failed to load branches:', err.message);
      // Fallback only to branches attached to user object from server auth response
      if (user.branches && user.branches.length > 0) {
        setBranches(user.branches);
        const fallback =
          user.branches.find((b) => b.is_user_default) ||
          user.defaultBranch ||
          user.branches[0];
        setActiveBranch(fallback);
        if (fallback) {
          localStorage.setItem('dental_erp_active_branch_id', fallback.id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // Handle branch access revoked or denied events
  useEffect(() => {
    const handleDenied = (e) => {
      const msg = e.detail?.message || 'Access to selected branch was revoked or is unauthorized.';
      toast.warn(msg);
      loadBranches();
    };

    window.addEventListener('branch:access_denied', handleDenied);
    return () => window.removeEventListener('branch:access_denied', handleDenied);
  }, [loadBranches]);

  // Branch switching is disabled for all ordinary clinic users
  const selectBranch = (branchOrId) => {
    const id = typeof branchOrId === 'object' ? branchOrId?.id : branchOrId;
    const branch = branches.find((b) => b.id === id);

    if (!branch) {
      toast.error('Branch not found in your authorized branch assignment.');
      return;
    }

    // Only allow if authorized
    setActiveBranch(branch);
    localStorage.setItem('dental_erp_active_branch_id', branch.id);
  };

  const setViewMode = () => {
    // Cross-branch / org-wide view is removed for strict branch isolation
  };

  const isMultiBranch = false; // Ordinary clinic users do not have multi-branch switching
  const isOrgAdmin = false;

  const value = {
    branches,
    activeBranch,
    isLoading,
    isMultiBranch,
    isOrgAdmin,
    viewMode,
    selectBranch,
    setViewMode,
    refreshBranches: loadBranches,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

export default BranchContext;
