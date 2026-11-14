import pickle,numpy as np
from pathlib import Path
class Restricted(pickle.Unpickler):
 def find_class(self,m,n):
  multiarray=(np._core if hasattr(np,'_core') else np.core).multiarray
  allowed={('numpy','ndarray'):np.ndarray,('numpy','dtype'):np.dtype}
  for module in ['numpy.core.multiarray','numpy._core.multiarray']:
   allowed[(module,'_reconstruct')]=multiarray._reconstruct;allowed[(module,'scalar')]=multiarray.scalar
  if (m,n) not in allowed: raise ValueError('Forbidden pickle global: '+m+'.'+n)
  return allowed[m,n]
def load_npy(path):
 if Path(path).stat().st_size>512*1024*1024: raise ValueError('DD100 file exceeds 512 MiB limit')
 with open(path,'rb') as f:
  v=np.lib.format.read_magic(f)
  shape,order,dtype=np.lib.format._read_array_header(f,v)
  if not dtype.hasobject: raise ValueError('Expected DD100 dictionary object array')
  a=Restricted(f).load()
  if not isinstance(a,np.ndarray) or a.shape!=(): raise ValueError('Expected scalar dictionary')
  d=a.item()
  if not isinstance(d,dict): raise ValueError('Expected dictionary')
  for key,value in d.items():
   if key in ['poses','transl','global_orient','betas'] and (not isinstance(value,np.ndarray) or value.dtype.kind not in 'fi' or value.dtype.hasobject): raise ValueError('DD100 fields must be numeric NumPy arrays')
  return d
if __name__=='__main__':
 import sys
 d=load_npy(sys.argv[1]); print({k:(str(type(v)),getattr(v,'shape',None),v if isinstance(v,dict) else '') for k,v in d.items()})
