"""Keep the existing desk export entry point on its retained, physically detailed source."""
from pathlib import Path
import runpy
import sys
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()

if __name__ == '__main__':
    runpy.run_path(str(HERE / 'render-office-desk-detail-oblique.py'), run_name='__main__')
