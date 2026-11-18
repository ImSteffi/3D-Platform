/** Platform name follows the domain: shap3d.io → "Shap3D Platform", tenzo.ee / tenzo3d.com (and anything else) → "Tenzo Platform". */
export function getPlatformName(hostname: string = typeof window !== 'undefined' ? window.location.hostname : ''): string {
  return hostname.toLowerCase().includes('shap3d') ? 'Shap3D Platform' : 'Tenzo Platform';
}

export const PLATFORM_NAME = getPlatformName();
