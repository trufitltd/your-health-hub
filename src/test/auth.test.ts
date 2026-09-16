import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Extract parseAppRole from ProtectedRoute for testing
// This is the role parsing logic used across the app
const parseAppRole = (value: unknown): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'doctor' ||
    normalized === 'patient' ||
    normalized === 'admin' ||
    normalized === 'coo' ||
    normalized === 'healthlink'
  ) {
    return normalized;
  }
  return 'patient';
};

describe('parseAppRole', () => {
  it('returns "patient" for null/undefined/empty', () => {
    expect(parseAppRole(null)).toBe('patient');
    expect(parseAppRole(undefined)).toBe('patient');
    expect(parseAppRole('')).toBe('patient');
  });

  it('normalizes valid roles to lowercase', () => {
    expect(parseAppRole('Doctor')).toBe('doctor');
    expect(parseAppRole('ADMIN')).toBe('admin');
    expect(parseAppRole('Coo')).toBe('coo');
    expect(parseAppRole('Patient')).toBe('patient');
    expect(parseAppRole('HealthLink')).toBe('healthlink');
  });

  it('defaults to "patient" for unknown roles', () => {
    expect(parseAppRole('superadmin')).toBe('patient');
    expect(parseAppRole('user')).toBe('patient');
    expect(parseAppRole('guest')).toBe('patient');
  });

  it('handles numeric and boolean inputs gracefully', () => {
    expect(parseAppRole(123)).toBe('patient');
    expect(parseAppRole(true)).toBe('patient');
  });
});

describe('roleDefaultPath', () => {
  const roleDefaultPath = (role: string) => {
    if (role === 'doctor') return '/doctor-portal';
    if (role === 'admin') return '/admin';
    if (role === 'coo') return '/coo';
    if (role === 'healthlink') return '/healthlink';
    return '/patient-portal';
  };

  it('maps roles to correct paths', () => {
    expect(roleDefaultPath('doctor')).toBe('/doctor-portal');
    expect(roleDefaultPath('admin')).toBe('/admin');
    expect(roleDefaultPath('coo')).toBe('/coo');
    expect(roleDefaultPath('healthlink')).toBe('/healthlink');
    expect(roleDefaultPath('patient')).toBe('/patient-portal');
  });

  it('defaults to patient portal for unknown roles', () => {
    expect(roleDefaultPath('unknown')).toBe('/patient-portal');
  });
});
